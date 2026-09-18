# Architecture

## Components

1. **Content script** inspects the active shopping page using structured data, metadata and visible-image heuristics.
2. **Side panel** presents detected products, stores a reusable multi-photo profile locally and tracks generation progress.
3. **Service worker** configures the side-panel experience and mediates browser events.
4. **Orchestration API** validates requests, queues jobs and routes work to an inference provider.
5. **Inference provider** selects a deterministic local mock or an authenticated HTTPS adapter using server-only configuration.
6. **GPU worker** lazy-loads CatVTON on a remote CUDA runtime, automatically masks the selected category and returns an in-memory WebP result.

## Trust boundaries

- Shopping-page content is untrusted.
- The extension never contains model-provider secrets.
- The backend validates URLs, category identifiers, image types and payload sizes.
- Profile photographs are sent only after an explicit user action.
- Redirected product-image downloads are restricted to public HTTPS addresses and capped at 10 MB.
- The GPU worker serializes inference and does not intentionally persist user or product photographs.
- Temporary server data is identified by opaque IDs and will have expiry/deletion controls.

## Product detection pipeline

```text
JSON-LD Product data
        +
OpenGraph metadata
        +
Visible DOM images and nearby text
        ↓
Normalization → scoring → deduplication → ranked candidates
```

Site-specific adapters may improve detection, but the generic pipeline remains the default and manual selection remains the fallback.

## Category routing

Every inference engine implements the same provider contract. The initial production target covers `upper_body`, `lower_body`, and `dress`. Future footwear and jewellery engines can be registered without changing extension behavior.

