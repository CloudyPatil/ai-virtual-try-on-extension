# AI Virtual Try-On Chrome Extension

An academic, privacy-aware shopping assistant that detects products on shopping pages and sends user-selected garments to a pluggable virtual try-on pipeline.

## Current milestone

The repository currently provides:

- a Chrome Manifest V3 extension with a side-panel interface;
- reusable cross-site product-candidate detection from JSON-LD, page metadata and visible images;
- ranked product cards with image-variant selection and a manual HTTPS image-URL override;
- a TypeScript orchestration API;
- reusable category-aware profiles and asynchronous inference jobs;
- shared API contracts and validation;
- requirement and architecture documentation;
- a secured remote CatVTON GPU worker and automated tests.

Mock inference remains the local default. Setting the documented provider variables routes jobs to the remote CatVTON worker so the development laptop does not carry the GPU load.

Phase 4's resumable Colab workflow is implemented, but a live CatVTON run on a fresh Colab runtime still needs to be recorded. Phase 5's detector has automated DOM tests; picker behavior and cross-site acceptance are tracked in [the Phase 5 validation checklist](docs/phase-5-validation.md). Neither an automated DOM test nor the mock provider proves that an arbitrary retailer will work or that a generated image is realistic.

## Repository layout

```text
apps/
  api/          Orchestration API and inference-provider abstraction
  extension/    Chrome extension, side panel and product detector
packages/
  contracts/    Shared schemas and TypeScript contracts
docs/           Architecture, traceability and implementation notes
notebooks/
  tryon_studio_colab.ipynb  One-cell resumable free-GPU launcher
scripts/
  configure-remote-worker.ps1  Secure local endpoint configurator
services/
  inference-worker/  Secured CatVTON service for a remote CUDA runtime
```

## Remote GPU setup

Use the resumable Colab notebook and follow `docs/colab-runbook.md`. Google Drive retains model and package caches between runtime replacements; rerunning one cell restores the worker and prints the current HTTPS tunnel URL.

## Choosing a product image

Open a shopping page and click **Scan page** in the extension side panel. Select a detected product card, then select the exact garment image from its available choices. If the correct image is missing, paste its public HTTPS image URL under **Image missing?** and click **Use URL**. The manual URL changes only the image sent for the selected product; it does not create a product when scanning finds none. Check the preview and clothing category before generating.

Retailer image hosts may block server-side downloads, require cookies, or return an unsupported image format. In those cases the preview or remote generation can fail even if the image appears in the browser. See [Phase 5 validation](docs/phase-5-validation.md) for a repeatable three-site test and failure log.

## Local setup

```powershell
npm.cmd install
npm.cmd run check
npm.cmd run dev:api
```

In a second terminal:

```powershell
npm.cmd run dev:extension
```

For a production extension build:

```powershell
npm.cmd run build --workspace @tryon/extension
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/dist`.

The lightweight worker tests can be run independently:

```powershell
cd services/inference-worker
python -m pytest -q
```

## Safety and scope

The initial release targets upper-body garments and dresses/lower-body garments. Model outputs are visual previews, not sizing guarantees. User photographs must not be used for training without explicit consent.

