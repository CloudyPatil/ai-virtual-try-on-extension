# Colab GPU validation runbook

Use [the notebook](../notebooks/tryon_studio_colab.ipynb) in Google Colab. It is an interactive, notebook-driven acceptance route, not an always-on extension backend.

## Before running

1. In Colab select **Runtime → Change runtime type → T4 GPU**.
2. Add `GITHUB_TOKEN` in Colab Secrets. Give it **Contents: Read-only** access to the private `CloudyPatil/ai-virtual-try-on-extension` repository and enable access for this notebook. Do not paste tokens into notebook code or share outputs containing tokens.
3. Use photos you have permission to process. Do not commit them or share a notebook with saved image outputs.

You do not need to create a Drive folder. Cell 2 mounts Drive and creates `MyDrive/TryOnStudio`.

## Execute

Run cells **1–5 in order**:

1. GPU preflight: confirms an NVIDIA GPU without any downloads.
2. Drive and source: stores reusable package/model caches in Drive; clones the private code repository to fast local VM storage. This avoids slow Git metadata operations on Drive.
3. Environment: creates isolated Python 3.11, installs matching CUDA PyTorch and pinned dependencies, and checks the CatVTON **pipeline** import. It does not download model weights. Success ends with `[4/4] Environment preparation complete.`
4. Upload: prompts separately for a person photo and garment photo. Preview the purple clothing-region mask. Choose `upper`, `lower`, or `overall` and edit `MASK_BOX` if necessary.
5. Real generation: downloads CatVTON attention/base/VAE weights into the Drive-backed cache on first use and generates one image. Success prints `REAL_TRYON_COMPLETE` and displays the result. Only this step tests actual model generation.

The rectangle mask is deliberately a simple, editable acceptance fixture. It is **not** the final automatic clothing masker and may produce rough edges. A live extension result with automatic masking remains a separate gate.

## Interrupted setup or runtime replacement

- Same VM, cell 3 failed: rerun cell 3. Install markers are written only after checks pass; the local Python/PyTorch environment can be reused.
- Same VM, cell 5 failed: rerun cell 5 after reviewing the error. Hugging Face downloads can resume from their cache.
- New VM: rerun cells 1–3, then upload images again in cell 4 and run cell 5. The new VM must recreate local Python and source, but Drive package/model caches can reduce downloads.
- Project fix pushed: rerun cell 2, then cell 3. Cell 2 fast-forwards the local checkout; it does not overwrite local edits.

After failure run the final diagnostics cell and share the **last error lines**, redacting credentials and personal image paths. The setup log is also saved in `MyDrive/TryOnStudio/setup.log`. Do not delete Drive caches as a first troubleshooting step.

## What this does and does not certify

The previous setup attempted `AutoMasker` import without installing its Detectron2 dependency. The new notebook deliberately tests the core CatVTON pipeline with an explicit mask; Detectron2 normally needs a build matched to PyTorch/CUDA, so a fully automatic extension worker still needs an independently validated masking solution. See [Detectron2 installation](https://github.com/facebookresearch/detectron2/blob/main/INSTALL.md).

Colab free runtimes are not guaranteed and may disconnect. Google's [Colab FAQ](https://research.google.com/colaboratory/faq.html) says free managed runtimes may terminate sessions that bypass the notebook UI to interact primarily through a web UI. Therefore this notebook does not run a public tunnel or background serving process. A successful cell 5 validates the model and GPU path, **not** the remote extension integration. Serving the extension needs a permitted runtime/provider plus a separately tested automatic masker.

CatVTON checkpoints are [CC BY-NC-SA 4.0](https://huggingface.co/zhengchong/CatVTON); this academic validation is non-commercial. Review model and base-model licenses before any other use.
