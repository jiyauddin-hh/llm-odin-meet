"""Talking-head renderer for the AI teacher (MuseTalk 1.5 on the GPU).

The backend (backend/src/lib/aiTeacher/face.js) starts this once per class and
stops it afterwards, so the GPU is only busy while a class runs. Models load
once; every request then only runs the UNet + VAE decoder, which is fast.

Protocol: one JSON command per line on stdin, one JSON answer per line on stdout.

  {"id": 1, "cmd": "prepare", "face": "/abs/face.jpg", "dir": "/abs/cache"}
  {"id": 2, "cmd": "render", "wav": "/abs/line.wav", "out": "/abs/line.mp4"}
  {"id": 3, "cmd": "idle", "out": "/abs/idle.mp4", "seconds": 10}
  -> {"id": 2, "ok": true, "frames": 180, "ms": 2400}  or  {"id": 2, "ok": false, "error": "..."}

The face can be a photo (it gets a gentle, looping head sway so it doesn't
look frozen) or a short front-facing video (played forwards then backwards).
Everything MuseTalk prints goes to stderr so stdout stays clean JSON.
"""
import hashlib
import json
import os
import pickle
import subprocess
import sys
import threading
import time
import traceback
from queue import Queue
from urllib.error import URLError
from urllib.request import Request, urlopen

# Answers go to the real stdout; anything else printed (by us or MuseTalk) goes to stderr.
OUT = os.fdopen(os.dup(1), "w", buffering=1)
os.dup2(2, 1)

# Grow memory segments instead of carving fixed blocks: the claimed block can then serve any allocation.
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

HERE = os.path.dirname(os.path.abspath(__file__))
MUSETALK = os.path.join(HERE, "MuseTalk")
os.chdir(MUSETALK)  # MuseTalk loads its weights from ./models
sys.path.insert(0, MUSETALK)

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402
import face_alignment  # noqa: E402
from transformers import WhisperModel  # noqa: E402
from musetalk.utils.utils import datagen  # noqa: E402
from musetalk.models.unet import UNet, PositionalEncoding  # noqa: E402
from musetalk.models.vae import VAE  # noqa: E402
from musetalk.utils.audio_processor import AudioProcessor  # noqa: E402
from musetalk.utils.face_parsing import FaceParsing  # noqa: E402
from musetalk.utils.blending import get_image_prepare_material, get_image_blending  # noqa: E402

FPS = 25
FRAME_W, FRAME_H = 1280, 720  # frames made from a photo are 16:9, like a webcam
SWAY_FRAMES = 125  # 5 s loop of head motion for a photo
EXTRA_MARGIN = 10  # MuseTalk 1.5 crops a little below the chin
BATCH = 8  # frames per UNet pass
DECODE = 4  # frames per VAE decode (the decoder's activations are the memory peak)
CACHE_VERSION = "1"
FFMPEG = os.environ.get("FFMPEG_PATH", "ffmpeg")
VIDEO_EXT = (".mp4", ".mov", ".webm", ".mkv", ".avi")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
torch.backends.cudnn.benchmark = True  # the shapes never change, so tune the convolutions once
GPU_GB = float(os.environ.get("AVATAR_GPU_GB", "3.6"))
OLLAMA = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- the GPU

def ollama_unload():
    """Asks Ollama to drop the models it holds (they reload on their next use)."""
    try:
        with urlopen(f"{OLLAMA}/api/ps", timeout=2) as r:
            names = [m["name"] for m in json.load(r).get("models", [])]
        for name in names:
            body = json.dumps({"model": name, "keep_alive": 0}).encode()
            urlopen(Request(f"{OLLAMA}/api/generate", data=body, headers={"Content-Type": "application/json"}), timeout=30).close()
        return names
    except (URLError, OSError, ValueError):
        return []


def claim_gpu():
    """Takes the memory the renderer needs in one go, the moment it is free.

    Other apps on this machine keep Ollama busy, so a model unloaded from the
    GPU comes straight back. Grabbing a block right after the unload wins
    that race; the block stays in PyTorch's cache and the models load into it.
    Ollama then fits what is left and runs the rest of its layers on the CPU.
    """
    need = int(GPU_GB * 2**30)
    deadline = time.time() + 90
    unloaded = []
    while True:
        try:
            block = torch.empty(need, dtype=torch.uint8, device=device)
            del block
            if unloaded:
                log(f"unloaded {', '.join(sorted(set(unloaded)))} from Ollama to make room")
            return
        except torch.OutOfMemoryError:
            if time.time() > deadline:
                raise RuntimeError(f"The GPU doesn't have {GPU_GB:g} GB free for the teacher's face")
            unloaded += ollama_unload()
            time.sleep(0.2)


# ---------------------------------------------------------------- models

t0 = time.time()
if device.type == "cuda":
    claim_gpu()
# The UNet's weights are 3.2 GB in float32: load and halve them on the CPU so
# the GPU only ever holds the 1.6 GB float16 copy.
_load = torch.load
torch.load = lambda f, *a, **k: _load(f, *a, **{**k, "map_location": "cpu"})
try:
    unet = UNet(unet_config=os.path.join("models", "musetalkV15", "musetalk.json"),
                model_path=os.path.join("models", "musetalkV15", "unet.pth"), use_float16=True, device="cpu")
finally:
    torch.load = _load
unet.model = unet.model.to(device)
vae = VAE(model_path=os.path.join("models", "sd-vae"))
vae.vae = vae.vae.half().to(device)
pe = PositionalEncoding(d_model=384).half().to(device)
dtype = unet.model.dtype
timesteps = torch.tensor([0], device=device)
audio = AudioProcessor(feature_extractor_path="./models/whisper")
whisper = WhisperModel.from_pretrained("./models/whisper").to(device=device, dtype=dtype).eval()
whisper.requires_grad_(False)
parser = FaceParsing(left_cheek_width=90, right_cheek_width=90)
landmarker = face_alignment.FaceAlignment(face_alignment.LandmarksType.TWO_D, flip_input=False, device=str(device))
log(f"avatar models loaded in {time.time() - t0:.1f}s on {device}")


# ---------------------------------------------------------------- the face

def studio_frames(img):
    """A photo becomes a 16:9 'webcam' loop: the portrait over a blurred copy
    of itself, with a slow, periodic head sway so it never looks frozen."""
    h0, w0 = img.shape[:2]
    s = FRAME_H / h0
    fw = round(w0 * s)
    portrait = cv2.resize(img, (fw, FRAME_H), interpolation=cv2.INTER_AREA)
    bh = round(h0 * FRAME_W / w0)
    bg = cv2.resize(img, (FRAME_W, bh), interpolation=cv2.INTER_AREA)
    top = max(0, (bh - FRAME_H) // 2)
    bg = cv2.GaussianBlur(bg[top:top + FRAME_H], (0, 0), 30).astype(np.float32) * 0.6
    # Feather the portrait's left/right edges into the background.
    alpha = np.ones((FRAME_H, fw), np.float32)
    feather = max(1, fw // 8)
    ramp = np.linspace(0, 1, feather, dtype=np.float32)
    alpha[:, :feather] *= ramp
    alpha[:, -feather:] *= ramp[::-1]
    x0 = (FRAME_W - fw) // 2
    base = bg.copy()
    region = base[:, x0:x0 + fw]
    base[:, x0:x0 + fw] = region * (1 - alpha[..., None]) + portrait.astype(np.float32) * alpha[..., None]
    base = base.clip(0, 255).astype(np.uint8)

    frames = []
    for i in range(SWAY_FRAMES):
        t = 2 * np.pi * i / SWAY_FRAMES
        angle = 0.9 * np.sin(t)
        scale = 1.05 + 0.008 * np.sin(2 * t)
        m = cv2.getRotationMatrix2D((FRAME_W / 2, FRAME_H * 0.55), angle, scale)
        m[0, 2] += 6 * np.sin(t + 0.7)
        m[1, 2] += 3 * np.sin(2 * t)
        frames.append(cv2.warpAffine(base, m, (FRAME_W, FRAME_H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT))
    return frames


def video_frames(path):
    cap = cv2.VideoCapture(path)
    frames = []
    while len(frames) < FPS * 20:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()
    if not frames:
        raise ValueError("Couldn't read any frames from the face video")
    return frames + frames[::-1]


def source_frames(path):
    if path.lower().endswith(VIDEO_EXT):
        return video_frames(path)
    img = cv2.imread(path)
    if img is None:
        raise ValueError("Couldn't read the face image")
    return studio_frames(img)


def face_box(frame):
    """MuseTalk's crop: from the nose bridge up by the nose-to-chin distance,
    down to the chin (68-point landmarks)."""
    found = landmarker.get_landmarks_from_image(frame[:, :, ::-1])
    if not found:
        return None
    lm = max(found, key=lambda p: np.ptp(p[:, 0]) * np.ptp(p[:, 1])).astype(np.int32)
    mid_y = lm[29][1]
    bottom = int(lm[:, 1].max())
    upper = max(0, mid_y - (bottom - mid_y))
    x1, x2 = int(max(0, lm[:, 0].min())), int(min(frame.shape[1], lm[:, 0].max()))
    y2 = min(frame.shape[0], bottom + EXTRA_MARGIN)
    if x2 - x1 < 20 or y2 - upper < 20:
        return None
    return [x1, int(upper), x2, y2]


class Avatar:
    def __init__(self, face, cache_dir):
        self.frames = source_frames(face)
        with open(face, "rb") as f:
            key = hashlib.sha1(f.read() + CACHE_VERSION.encode()).hexdigest()
        cache = os.path.join(cache_dir, f"musetalk-{key[:16]}.pkl")
        if os.path.exists(cache):
            with open(cache, "rb") as f:
                d = pickle.load(f)
            self.boxes, self.masks, self.crops = d["boxes"], d["masks"], d["crops"]
            self.latents = [torch.from_numpy(x).to(device) for x in d["latents"]]
            log(f"avatar loaded from cache ({len(self.frames)} frames)")
        else:
            self.prepare()
            os.makedirs(cache_dir, exist_ok=True)
            with open(cache + ".tmp", "wb") as f:
                pickle.dump({"boxes": self.boxes, "masks": self.masks, "crops": self.crops,
                             "latents": [x.cpu().numpy() for x in self.latents]}, f)
            os.replace(cache + ".tmp", cache)
        self.h, self.w = self.frames[0].shape[:2]
        self.cursor = 0  # where the head motion is, so consecutive clips continue smoothly

    @torch.no_grad()
    def prepare(self):
        t = time.time()
        self.boxes, self.masks, self.crops, self.latents = [], [], [], []
        last = None
        for frame in self.frames:
            box = face_box(frame) or last
            if box is None:
                raise ValueError("No face found. Use a clear, front-facing photo or video")
            last = box
            x1, y1, x2, y2 = box
            crop = cv2.resize(frame[y1:y2, x1:x2], (256, 256), interpolation=cv2.INTER_LANCZOS4)
            self.latents.append(vae.get_latents_for_unet(crop))
            mask, crop_box = get_image_prepare_material(frame, box, fp=parser, mode="jaw")
            self.boxes.append(box)
            self.masks.append(mask)
            self.crops.append(crop_box)
        log(f"avatar prepared: {len(self.frames)} frames in {time.time() - t:.1f}s")

    def compose(self, i, face):
        n = len(self.frames)
        x1, y1, x2, y2 = self.boxes[i % n]
        face = cv2.resize(face.astype(np.uint8), (x2 - x1, y2 - y1))
        return get_image_blending(self.frames[i % n], face, self.boxes[i % n], self.masks[i % n], self.crops[i % n])

    def encoder(self, out, wav=None):
        cmd = [FFMPEG, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{self.w}x{self.h}",
               "-r", str(FPS), "-i", "-"]
        if wav:
            cmd += ["-i", wav, "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-shortest"]
        cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", out + ".part.mp4"]
        return subprocess.Popen(cmd, stdin=subprocess.PIPE)

    @staticmethod
    def finish(proc, out):
        proc.stdin.close()
        if proc.wait() != 0:
            raise RuntimeError("ffmpeg failed")
        os.replace(out + ".part.mp4", out)

    @torch.no_grad()
    def render(self, wav, out):
        feats, length = audio.get_audio_feature(wav, weight_dtype=dtype)
        chunks = audio.get_whisper_chunk(feats, device, dtype, whisper, length, fps=FPS,
                                         audio_padding_length_left=2, audio_padding_length_right=2)
        n = len(self.frames)
        start = self.cursor
        # Rotate the latent cycle so the clip starts where the head currently is.
        latents = self.latents[start % n:] + self.latents[:start % n]
        proc = self.encoder(out, wav)
        q = Queue(maxsize=64)
        spent = {"compose": 0.0, "write": 0.0}
        t0 = time.time()

        failed = []

        def writer():
            i = start
            while (face := q.get()) is not None:
                if failed:
                    continue  # keep draining so the GPU loop never blocks
                try:
                    t = time.time()
                    frame = self.compose(i, face)
                    spent["compose"] += time.time() - t
                    t = time.time()
                    proc.stdin.write(frame.tobytes())
                    spent["write"] += time.time() - t
                except Exception as e:  # ffmpeg died: stop rendering this clip
                    failed.append(e)
                i += 1

        th = threading.Thread(target=writer, daemon=True)
        th.start()
        try:
            for whisper_batch, latent_batch in datagen(chunks, latents, BATCH, device=device):
                if failed:
                    break
                feats_b = pe(whisper_batch.to(device))
                pred = unet.model(latent_batch.to(device=device, dtype=dtype), timesteps, encoder_hidden_states=feats_b).sample
                for k in range(0, len(pred), DECODE):
                    for face in vae.decode_latents(pred[k:k + DECODE].to(dtype=vae.vae.dtype)):
                        q.put(face)
        finally:
            q.put(None)
            th.join()
        gpu = time.time() - t0
        if failed:
            proc.kill()
            raise RuntimeError(f"Encoding the clip failed: {failed[0]}")
        self.finish(proc, out)
        log(f"rendered {len(chunks)} frames in {time.time() - t0:.1f}s (gpu loop {gpu:.1f}s, compose {spent['compose']:.1f}s, encode wait {spent['write']:.1f}s)")
        self.cursor = start + len(chunks)
        return len(chunks)

    def idle(self, out, seconds):
        """The face without lip movement: shown while the teacher isn't speaking."""
        proc = self.encoder(out)
        n = len(self.frames)
        # A whole number of motion loops so the video loops seamlessly.
        total = max(n, int(round(seconds * FPS / n)) * n)
        for i in range(total):
            proc.stdin.write(self.frames[i % n].tobytes())
        self.finish(proc, out)
        return total


# ---------------------------------------------------------------- loop

avatar = None


def handle(cmd):
    global avatar
    kind = cmd.get("cmd")
    if kind == "prepare":
        avatar = Avatar(cmd["face"], cmd["dir"])
        return {"frames": len(avatar.frames), "width": avatar.w, "height": avatar.h}
    if kind == "render":
        if avatar is None:
            raise ValueError("Call prepare first")
        return {"frames": avatar.render(cmd["wav"], cmd["out"])}
    if kind == "idle":
        if avatar is None:
            raise ValueError("Call prepare first")
        return {"frames": avatar.idle(cmd["out"], float(cmd.get("seconds", 10)))}
    if kind == "ping":
        if device.type != "cuda":
            return {"gpu": "cpu"}
        return {"gpu": torch.cuda.get_device_name(0), "peakGB": round(torch.cuda.max_memory_allocated() / 2**30, 2),
                "reservedGB": round(torch.cuda.memory_reserved() / 2**30, 2)}
    raise ValueError(f"Unknown command {kind!r}")


def reply(payload):
    OUT.write(json.dumps(payload) + "\n")
    OUT.flush()


reply({"ready": True})
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        cmd = json.loads(line)
    except json.JSONDecodeError:
        continue
    started = time.time()
    try:
        result = handle(cmd)
        reply({"id": cmd.get("id"), "ok": True, "ms": round((time.time() - started) * 1000), **result})
    except Exception as e:  # keep serving; the backend decides what to do
        traceback.print_exc()
        reply({"id": cmd.get("id"), "ok": False, "error": str(e)})
