from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from urllib.request import urlopen

CATVTON_REPOSITORY = "https://github.com/Zheng-Chong/CatVTON.git"
CATVTON_REVISION = "7818397f25613beedb3d861a34769f607cfcf3b1"
TUNNEL_PATTERN = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


def run(command: list[str], **kwargs):
    print("+", " ".join(command), flush=True)
    return subprocess.run(command, check=True, **kwargs)


def file_digest(*paths: Path) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.read_bytes())
    digest.update(CATVTON_REVISION.encode())
    return digest.hexdigest()[:16]


def require_gpu() -> str:
    import torch

    if not torch.cuda.is_available():
        raise RuntimeError("No CUDA GPU detected. In Colab choose Runtime > Change runtime type > T4 GPU.")
    properties = torch.cuda.get_device_properties(0)
    memory_gb = properties.total_memory / 1024**3
    if memory_gb < 7.5:
        raise RuntimeError(f"{properties.name} has only {memory_gb:.1f} GB VRAM; CatVTON needs approximately 8 GB.")
    return f"{properties.name} ({memory_gb:.1f} GB VRAM)"


def ensure_catvton(vendor_dir: Path) -> Path:
    repository = vendor_dir / "CatVTON"
    vendor_dir.mkdir(parents=True, exist_ok=True)
    if not (repository / ".git").exists():
        run(["git", "clone", "--filter=blob:none", "--branch", "edited", CATVTON_REPOSITORY, str(repository)])
    current = subprocess.run(
        ["git", "-C", str(repository), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if current != CATVTON_REVISION:
        run(["git", "-C", str(repository), "fetch", "origin", CATVTON_REVISION, "--depth", "1"])
        run(["git", "-C", str(repository), "checkout", "--detach", CATVTON_REVISION])
    return repository


def ensure_dependencies(worker_dir: Path, catvton_dir: Path, persistent_root: Path, runtime_root: Path) -> None:
    marker_key = file_digest(worker_dir / "requirements-colab.txt", Path(__file__))
    marker = runtime_root / f"dependencies-{marker_key}.ready"
    if marker.exists():
        print("Dependencies already prepared in this runtime.")
        return

    pip_cache = persistent_root / "pip-cache"
    pip_cache.mkdir(parents=True, exist_ok=True)
    environment = {**os.environ, "PIP_CACHE_DIR": str(pip_cache)}
    run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--only-binary=numpy,scipy,matplotlib,opencv-python,pillow,scikit-image,pycocotools,av,tokenizers,safetensors",
            "--timeout", "60",
            "--retries", "3",
            "-r",
            str(worker_dir / "requirements-colab.txt"),
        ],
        env=environment,
    )
    run([sys.executable, "-m", "pip", "check"], env=environment)
    # Verify the real model imports before declaring setup complete.
    # This does not download checkpoints or perform inference.
    run([
        sys.executable, "-c",
        "import sys; sys.path.insert(0, " + repr(str(catvton_dir)) + "); "
        "import numpy, scipy, cv2, av, peft, transformers, diffusers; "
        "from model.pipeline import CatVTONPipeline; "
        "from model.cloth_masker import AutoMasker; "
        "print('CatVTON imports verified.')",
    ], env=environment)
    marker.touch()


def ensure_cloudflared(runtime_root: Path) -> Path:
    binary = runtime_root / "cloudflared"
    if binary.exists():
        return binary
    print("Downloading cloudflared...")
    with urlopen(
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64",
        timeout=60,
    ) as response:
        binary.write_bytes(response.read())
    binary.chmod(0o755)
    return binary


def process_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def health_ready(url: str) -> bool:
    try:
        with urlopen(url, timeout=5) as response:
            return response.status == 200
    except Exception:
        return False


def read_state(state_path: Path) -> dict:
    if not state_path.exists():
        return {}
    try:
        return json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def stop_process(pid: int | None) -> None:
    if process_alive(pid):
        os.kill(pid, signal.SIGTERM)


def start_runtime(worker_dir: Path, catvton_dir: Path, persistent_root: Path, runtime_root: Path, token: str) -> dict:
    state_path = runtime_root / "state.json"
    state = read_state(state_path)
    if (
        process_alive(state.get("worker_pid"))
        and process_alive(state.get("tunnel_pid"))
        and health_ready("http://127.0.0.1:7860/health")
        and health_ready(f"{state.get('public_url', '')}/health")
    ):
        print("Existing worker and tunnel are healthy; reusing them.")
        return state

    stop_process(state.get("worker_pid"))
    stop_process(state.get("tunnel_pid"))

    logs = runtime_root / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    environment = {
        **os.environ,
        "TRYON_WORKER_TOKEN": token,
        "CATVTON_REPO": str(catvton_dir),
        "CATVTON_PRECISION": "fp16",
        "HF_HOME": str(persistent_root / "huggingface"),
        "HF_HUB_CACHE": str(persistent_root / "huggingface" / "hub"),
        "PYTHONUNBUFFERED": "1",
    }
    worker_log = (logs / "worker.log").open("w", encoding="utf-8")
    worker = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app:app",
            "--host",
            "127.0.0.1",
            "--port",
            "7860",
        ],
        cwd=worker_dir,
        env=environment,
        stdout=worker_log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    for _ in range(60):
        if health_ready("http://127.0.0.1:7860/health"):
            break
        if worker.poll() is not None:
            raise RuntimeError(f"Worker exited early. Inspect {logs / 'worker.log'}")
        time.sleep(1)
    else:
        stop_process(worker.pid)
        raise RuntimeError(f"Worker did not become healthy. Inspect {logs / 'worker.log'}")

    cloudflared = ensure_cloudflared(runtime_root)
    tunnel_log_path = logs / "tunnel.log"
    tunnel_log = tunnel_log_path.open("w", encoding="utf-8")
    tunnel = subprocess.Popen(
        [str(cloudflared), "tunnel", "--url", "http://127.0.0.1:7860", "--no-autoupdate"],
        stdout=tunnel_log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    public_url = ""
    for _ in range(60):
        text = tunnel_log_path.read_text(encoding="utf-8", errors="replace")
        match = TUNNEL_PATTERN.search(text)
        if match:
            public_url = match.group(0)
            break
        if tunnel.poll() is not None:
            raise RuntimeError(f"Tunnel exited early. Inspect {tunnel_log_path}")
        time.sleep(1)
    if not public_url:
        stop_process(tunnel.pid)
        stop_process(worker.pid)
        raise RuntimeError(f"Tunnel URL was not created. Inspect {tunnel_log_path}")

    state = {
        "worker_pid": worker.pid,
        "tunnel_pid": tunnel.pid,
        "public_url": public_url,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    return state


def main() -> None:
    parser = argparse.ArgumentParser(description="Resume the TryOn Studio Colab GPU runtime")
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--persistent-root", required=True, type=Path)
    parser.add_argument("--token", default=os.environ.get("TRYON_WORKER_TOKEN", ""))
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()

    if not args.prepare_only and len(args.token) < 24:
        raise RuntimeError("TRYON_WORKER_TOKEN must contain at least 24 characters")

    worker_dir = args.project_root / "services" / "inference-worker"
    if not (worker_dir / "app.py").exists():
        raise RuntimeError(f"Inference worker not found at {worker_dir}")

    runtime_root = Path("/content/tryon-studio")
    runtime_root.mkdir(parents=True, exist_ok=True)
    args.persistent_root.mkdir(parents=True, exist_ok=True)

    if sys.version_info[:2] != (3, 11):
        raise RuntimeError("Use colab_bootstrap.py to launch the isolated Python 3.11 environment.")
    print("GPU:", require_gpu(), flush=True)
    catvton_dir = ensure_catvton(args.persistent_root / "vendor")
    ensure_dependencies(worker_dir, catvton_dir, args.persistent_root, runtime_root)
    if args.prepare_only:
        print("[4/4] Environment preparation complete.", flush=True)
        print("No web worker or tunnel was started.", flush=True)
        print("Checkpoints and real inference have not been tested yet.", flush=True)
        print("Worker Python:", sys.executable, flush=True)
        return
    print("[4/4] Starting worker and tunnel.", flush=True)
    state = start_runtime(worker_dir, catvton_dir, args.persistent_root, runtime_root, args.token)

    print("\nTryOn Studio GPU worker is ready.")
    print("TRYON_PROVIDER=remote")
    print(f"TRYON_PROVIDER_URL={state['public_url']}")
    print("TRYON_PROVIDER_TOKEN=<the TRYON_WORKER_TOKEN stored in Colab Secrets>")
    print("\nAfter a runtime disconnect, rerun only the notebook's Resume cell.")


if __name__ == "__main__":
    main()
