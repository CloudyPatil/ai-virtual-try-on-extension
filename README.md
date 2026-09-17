# AI Virtual Try-On Chrome Extension

An academic, privacy-aware shopping assistant that detects products on shopping pages and sends user-selected garments to a pluggable virtual try-on pipeline.

## Current milestone

The repository currently provides:

- a Chrome Manifest V3 extension with a side-panel interface;
- reusable cross-site product-candidate detection;
- a TypeScript orchestration API;
- asynchronous mock inference jobs;
- shared API contracts and validation;
- requirement and architecture documentation;
- automated tests.

The mock provider deliberately labels its output. A remote CatVTON-compatible provider will replace it after the GPU feasibility benchmark.

## Repository layout

```text
apps/
  api/          Orchestration API and inference-provider abstraction
  extension/    Chrome extension, side panel and product detector
packages/
  contracts/    Shared schemas and TypeScript contracts
docs/           Architecture, traceability and implementation notes
```

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

## Safety and scope

The initial release targets upper-body garments and dresses/lower-body garments. Model outputs are visual previews, not sizing guarantees. User photographs must not be used for training without explicit consent.

