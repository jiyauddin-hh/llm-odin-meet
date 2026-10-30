#!/usr/bin/env bash
# Installs the AI teacher's talking face (MuseTalk 1.5, open source, runs on an
# NVIDIA GPU). About 6 GB with PyTorch. Safe to re-run.
set -e
cd "$(dirname "$0")"
COMMIT=0a89dec45a0192b824e3cf4daf96c239440c5ed8

if [ ! -d MuseTalk ]; then
  git clone -q https://github.com/TMElyralab/MuseTalk.git
  git -C MuseTalk checkout -q "$COMMIT"
fi

if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cu128
  .venv/bin/pip install -q "diffusers==0.30.2" "transformers==4.46.3" "accelerate==1.1.1" "huggingface_hub==0.26.5" \
    opencv-python-headless soundfile librosa einops omegaconf face-alignment numpy pillow
fi

M=MuseTalk/models
HF=".venv/bin/huggingface-cli download"
mkdir -p $M/musetalkV15 $M/sd-vae $M/whisper $M/face-parse-bisent
[ -s $M/musetalkV15/unet.pth ] || $HF TMElyralab/MuseTalk musetalkV15/musetalk.json musetalkV15/unet.pth --local-dir $M >/dev/null
[ -s $M/sd-vae/diffusion_pytorch_model.bin ] || $HF stabilityai/sd-vae-ft-mse config.json diffusion_pytorch_model.bin --local-dir $M/sd-vae >/dev/null
[ -s $M/whisper/pytorch_model.bin ] || $HF openai/whisper-tiny config.json pytorch_model.bin preprocessor_config.json --local-dir $M/whisper >/dev/null
[ -s $M/face-parse-bisent/79999_iter.pth ] || $HF ManyOtherFunctions/face-parse-bisent 79999_iter.pth --local-dir $M/face-parse-bisent >/dev/null
if [ ! -s $M/face-parse-bisent/resnet18-5c106cde.pth ]; then
  curl -sfL -o $M/face-parse-bisent/resnet18-5c106cde.pth https://download.pytorch.org/models/resnet18-5c106cde.pth
  # PyTorch's own file is in the legacy format that torch.load(weights_only=True) refuses; re-save it.
  .venv/bin/python -I -c "import torch; p='$M/face-parse-bisent/resnet18-5c106cde.pth'; torch.save(torch.load(p, weights_only=False, map_location='cpu'), p)"
fi

echo "Avatar ready: $(du -sh MuseTalk/models | cut -f1) of models"
