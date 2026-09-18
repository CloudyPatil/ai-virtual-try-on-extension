# AI Virtual Try-On Chrome Extension

An academic, privacy-aware shopping assistant that detects products on shopping pages and sends user-selected garments to a pluggable virtual try-on pipeline.

## Current milestone

The repository currently provides:

- a Chrome Manifest V3 extension with a side-panel interface;
- reusable cross-site product-candidate detection;
- a TypeScript orchestration API;
- reusable category-aware profiles and asynchronous inference jobs;
- shared API contracts and validation;
- requirement and architecture documentation;
- a secured remote CatVTON GPU worker and automated tests.

Mock inference remains the local default. Setting the documented provider variables routes jobs to the remote CatVTON worker so the development laptop does not carry the GPU load.

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

