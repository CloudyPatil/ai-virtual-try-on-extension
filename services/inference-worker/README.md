# CatVTON remote inference worker

This service implements the private worker contract used by `apps/api`. The separate notebook validation route tests CatVTON inside Colab without running a public web worker.

## Runtime setup

1. Open `notebooks/tryon_studio_colab.ipynb` in a T4 GPU Colab runtime.
2. Add the private-repository `GITHUB_TOKEN` to Colab Secrets, with Contents: Read-only access.
3. Run the numbered notebook cells. The last generation cell tests the real model with an explicit, previewed clothing-region mask.

The first-run, reconnection, and recovery instructions are in `docs/colab-runbook.md`. Source and the Python environment live on the VM; package/model caches and setup logs live in Drive. Colab's free tier is used interactively through notebook cells, not as an always-on backend.

The API worker lazily downloads and loads CatVTON on its first request. It holds only in-memory images, serializes GPU inference, and returns a WebP data URL. Its automatic masker currently imports Detectron2, which the notebook environment does not install. Thus notebook success does not certify the remote API worker; automatic masking and permitted remote hosting remain separate work.

## License boundary

CatVTON code and checkpoints are CC BY-NC-SA 4.0 and therefore suitable for this academic, non-commercial assignment. Any commercial reuse requires a separate model/licensing decision.
