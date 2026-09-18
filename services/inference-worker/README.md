# CatVTON remote inference worker

This service implements the private worker contract used by `apps/api`. It is designed for a CUDA-backed Google Colab session or a GPU Hugging Face Space, keeping model load away from the development laptop.

## Runtime setup

1. Open `notebooks/tryon_studio_colab.ipynb` in a T4 GPU Colab runtime.
2. Add the private-repository `GITHUB_TOKEN` and a stable `TRYON_WORKER_TOKEN` to Colab Secrets.
3. Run the notebook's single **Resume runtime** cell.
4. Copy its new HTTPS URL into the local backend using `scripts/configure-remote-worker.ps1`.

The complete first-run, reconnection and recovery instructions are in `docs/colab-runbook.md`. The runtime manager pins the official CatVTON revision, retains source/model/pip caches in Google Drive, skips completed setup inside a healthy VM and recreates only lost processes after a disconnect.

The worker lazily downloads and loads CatVTON on its first request. It holds only in-memory images, serializes GPU inference to avoid out-of-memory failures, and returns a WebP data URL. It does not log or persist photographs.

## License boundary

CatVTON code and checkpoints are CC BY-NC-SA 4.0 and therefore suitable for this academic, non-commercial assignment. Any commercial reuse requires a separate model/licensing decision.
