"""Prepare CatVTON independently of Colab's changing kernel Python version."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

UV_VERSION = "0.8.22"
TORCH_VERSION = "2.4.1+cu121"
TORCHVISION_VERSION = "0.19.1+cu121"


def run_logged(command: list[str], environment: dict[str, str], log_path: Path):
    print("+ " + " ".join(command), flush=True)
    with log_path.open("a", encoding="utf-8") as log:
        log.write("+ " + " ".join(command) + "\n")
        log.flush()
        with subprocess.Popen(
            command, env=environment, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, bufsize=1,
        ) as process:
            assert process.stdout is not None
            for line in process.stdout:
                print(line, end="", flush=True)
                log.write(line)
                log.flush()
            code = process.wait()
    if code:
        raise RuntimeError(f"Setup command failed with exit code {code}. Inspect setup.log.")


def ensure_worker_python(persistent_root: Path, runtime_root: Path, log_path: Path) -> Path:
    tools = runtime_root / "tools"
    venv = runtime_root / "venv-py311"
    python = venv / "bin" / "python"
    environment = {
        **os.environ,
        "PIP_CACHE_DIR": str(persistent_root / "pip-cache"),
        "UV_CACHE_DIR": str(runtime_root / "uv-cache"),
        "UV_PYTHON_INSTALL_DIR": str(runtime_root / "python"),
        "UV_LINK_MODE": "copy",
    }
    if not python.exists():
        print("[1/4] Preparing a separate Python 3.11 environment.", flush=True)
        if not (tools / "uv" / "__init__.py").exists():
            run_logged([
                sys.executable, "-m", "pip", "install",
                "--disable-pip-version-check", "--only-binary=:all:",
                "--target", str(tools), f"uv=={UV_VERSION}",
            ], environment, log_path)
        uv_environment = {**environment, "PYTHONPATH": str(tools)}
        run_logged([sys.executable, "-m", "uv", "python", "install", "3.11"],
                   uv_environment, log_path)
        run_logged([sys.executable, "-m", "uv", "venv", "--seed",
                    "--python", "3.11", str(venv)], uv_environment, log_path)
    else:
        print("[1/4] Reusing this VM's Python 3.11 environment.", flush=True)

    run_logged([str(python), "-c",
                "import sys; assert sys.version_info[:2] == (3, 11); print('Worker Python:', sys.version)"],
               environment, log_path)
    torch_marker = runtime_root / "torch-cu121.ready"
    if not torch_marker.exists():
        print("[2/4] Installing CUDA PyTorch wheels. The first download is large.", flush=True)
        run_logged([
            str(python), "-m", "pip", "install", "--disable-pip-version-check",
            "--only-binary=:all:", "--timeout", "60", "--retries", "3",
            f"torch=={TORCH_VERSION}", f"torchvision=={TORCHVISION_VERSION}",
            "--index-url", "https://download.pytorch.org/whl/cu121",
        ], environment, log_path)
        run_logged([str(python), "-c",
                    "import torch, torchvision; assert torch.cuda.is_available(), 'CUDA is unavailable'; print('CUDA GPU:', torch.cuda.get_device_name(0))"],
                   environment, log_path)
        torch_marker.touch()
    else:
        print("[2/4] Reusing CUDA PyTorch from this VM.", flush=True)
    return python


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--persistent-root", type=Path, required=True)
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    runtime_root = Path("/content/tryon-studio")
    runtime_root.mkdir(parents=True, exist_ok=True)
    args.persistent_root.mkdir(parents=True, exist_ok=True)
    log_path = runtime_root / "setup.log"
    print("Colab kernel Python:", sys.version.split()[0], flush=True)
    environment = {**os.environ, "PYTHONUNBUFFERED": "1"}
    try:
        # Check the driver without importing packages from Colab's kernel.
        run_logged(["nvidia-smi", "--query-gpu=name,memory.total",
                    "--format=csv,noheader"], environment, log_path)
        python = ensure_worker_python(args.persistent_root, runtime_root, log_path)
        print("[3/4] Preparing CatVTON dependencies and checking imports.", flush=True)
        command = [str(python), "-u",
                   str(args.project_root / "services/inference-worker/colab_runtime.py"),
                   "--project-root", str(args.project_root),
                   "--persistent-root", str(args.persistent_root)]
        if args.prepare_only:
            command.append("--prepare-only")
        run_logged(command, environment, log_path)
    finally:
        if log_path.exists():
            shutil.copyfile(log_path, args.persistent_root / "setup.log")
            print("Setup log saved to My Drive/TryOnStudio/setup.log", flush=True)


if __name__ == "__main__":
    main()
