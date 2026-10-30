"""Runs inside the sandbox container.

Reads a job as JSON on stdin:
  {"language": "python", "code": "...", "timeLimitMs": 2000,
   "tests": [{"input": "...", "expected": "..."}]}
Writes the result as JSON on stdout.
"""
import json
import os
import resource
import shutil
import subprocess
import sys
import time

LANGS = {
    "python": {"file": "main.py", "compile": None, "run": ["python3", "-B", "main.py"], "extraMs": 0},
    "javascript": {"file": "main.js", "compile": None, "run": ["node", "main.js"], "extraMs": 200},
    "cpp": {
        "file": "main.cpp",
        "compile": ["g++", "-O2", "-std=c++17", "-o", "main", "main.cpp"],
        "run": ["./main"],
        "extraMs": 0,
    },
    "java": {
        "file": "Main.java",
        "compile": ["javac", "-J-Xmx256m", "-J-XX:-UsePerfData", "Main.java"],
        "run": ["java", "-Xmx256m", "-Xss64m", "-XX:+UseSerialGC", "-XX:-UsePerfData", "-XX:TieredStopAtLevel=1", "Main"],
        "extraMs": 1000,
    },
    # Builds against the modules and warm read-only cache baked into the image
    # (see Dockerfile); go.mod and go.sum are copied in next to main.go.
    "go": {
        "file": "main.go",
        "setup": ["/judge/gomod/go.mod", "/judge/gomod/go.sum"],
        "compile": ["go", "build", "-o", "main", "."],
        "run": ["./main"],
        "extraMs": 0,
    },
}

MAX_OUTPUT = 64 * 1024


def clip(text):
    return text if len(text) <= MAX_OUTPUT else text[:MAX_OUTPUT] + "\n...[truncated]"


def copy_or_link(src, dst):
    """Copies small files; hard-links big ones (compiled binaries, e.g. a 16 MB
    Gin + GORM program) read-only, so per-test copies don't fill the small /tmp."""
    if os.path.getsize(src) > 1024 * 1024:
        os.chmod(src, 0o555)
        os.link(src, dst)
    else:
        shutil.copy2(src, dst)


def normalize(text):
    lines = text.replace("\r\n", "\n").rstrip().split("\n")
    return "\n".join(line.rstrip() for line in lines)


def main():
    job = json.load(sys.stdin)
    lang = LANGS.get(job["language"])
    if lang is None:
        print(json.dumps({"verdict": "Internal Error", "error": "Unsupported language"}))
        return

    workdir = "/tmp/work"
    os.makedirs(workdir, exist_ok=True)
    os.chdir(workdir)
    with open(lang["file"], "w") as f:
        f.write(job["code"])
    for path in lang.get("setup", []):
        shutil.copy(path, workdir)

    if lang["compile"]:
        try:
            proc = subprocess.run(lang["compile"], capture_output=True, text=True, timeout=30)
        except subprocess.TimeoutExpired:
            print(json.dumps({"verdict": "Compilation Error", "compileOutput": "Compilation timed out"}))
            return
        if proc.returncode != 0:
            print(json.dumps({"verdict": "Compilation Error", "compileOutput": clip(proc.stderr or proc.stdout)}))
            return

    limit_s = (job.get("timeLimitMs", 2000) + lang["extraMs"]) / 1000
    results = []
    for test in job["tests"]:
        # Each test starts from a clean copy of the compiled program, so files
        # written by one test can't affect the next.
        rundir = "/tmp/run"
        shutil.rmtree(rundir, ignore_errors=True)
        shutil.copytree(workdir, rundir, copy_function=copy_or_link)
        start = time.monotonic()
        try:
            proc = subprocess.run(
                lang["run"], input=test["input"], capture_output=True, text=True, timeout=limit_s, cwd=rundir
            )
            elapsed = int((time.monotonic() - start) * 1000)
            stdout, stderr = clip(proc.stdout), clip(proc.stderr)
            if proc.returncode == -9:
                verdict = "Memory Limit Exceeded"
            elif proc.returncode != 0:
                verdict = "Runtime Error"
            elif test.get("expected") is None:
                verdict = "Ran"
            elif normalize(proc.stdout) == normalize(test["expected"]):
                verdict = "Accepted"
            else:
                verdict = "Wrong Answer"
        except subprocess.TimeoutExpired as e:
            elapsed = int(limit_s * 1000)
            stdout = clip(e.stdout.decode() if isinstance(e.stdout, bytes) else (e.stdout or ""))
            stderr = ""
            verdict = "Time Limit Exceeded"
        memory_kb = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
        results.append(
            {"verdict": verdict, "timeMs": elapsed, "memoryKb": memory_kb, "stdout": stdout, "stderr": stderr}
        )

    # The overall verdict is the first non-accepted test's verdict.
    overall = next((r["verdict"] for r in results if r["verdict"] not in ("Accepted", "Ran")), None)
    if overall is None:
        overall = "Accepted" if all(r["verdict"] == "Accepted" for r in results) else "Ran"
    print(json.dumps({"verdict": overall, "results": results}))


if __name__ == "__main__":
    main()
