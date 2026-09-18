# CatVTON remote inference worker

This service implements the private worker contract used by `apps/api`. It is designed for a CUDA-backed Google Colab session or a GPU Hugging Face Space, keeping model load away from the development laptop.

## Runtime setup

1. Start a GPU runtime with at least 8 GB VRAM.
2. Clone the official non-commercial CatVTON repository to `/content/CatVTON`.
3. Install its requirements and this directory's lightweight API requirements.
4. Set a long random `TRYON_WORKER_TOKEN`.
5. Start `uvicorn app:app --host 0.0.0.0 --port 7860` from this directory.
6. Expose the port through an authenticated HTTPS tunnel, then configure the Node API with `TRYON_PROVIDER=remote`, `TRYON_PROVIDER_URL`, and the same token.

The worker lazily downloads and loads CatVTON on its first request. It holds only in-memory images, serializes GPU inference to avoid out-of-memory failures, and returns a WebP data URL. It does not log or persist photographs.

## License boundary

CatVTON code and checkpoints are CC BY-NC-SA 4.0 and therefore suitable for this academic, non-commercial assignment. Any commercial reuse requires a separate model/licensing decision.
