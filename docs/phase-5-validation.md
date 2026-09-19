# Phase 5 browser validation

Phase 5 adds cross-site product candidate detection, multiple image choices per candidate and a manual HTTPS image-URL override. The automated DOM tests cover known markup patterns, but live retailer behavior has not yet been certified. Record this checklist before calling Phase 5 complete.

## What is implemented

- The content script combines JSON-LD Product data, product-like Open Graph/Twitter metadata and visible DOM images. It ranks and merges candidates, returning at most 24 products.
- Structured-data image arrays and image objects, lazy-image attributes, `srcset` and `picture` sources can contribute image choices. A candidate carries at most 16 URLs.
- The side panel lets the user select a candidate and one of its image choices. A public HTTPS image URL can replace the selected image for that candidate; it cannot create a product card when no candidate was detected.
- Only `upper_body`, `lower_body` and `dress` proceed to generation. If category inference is uncertain, the user must confirm a clothing category.

## Three-site matrix

These are suggested real-retailer targets, not a claim that any current page is supported. Use public pages you can access lawfully. If a target is unavailable, substitute another retailer on a different domain and record why. Choose an actual garment, not footwear or accessories.

| Site target | Page and feature to exercise | Minimum observation to record |
|---|---|---|
| Myntra (`myntra.com`) | Clothing search or category listing; select two distinct garments | Candidate count, two correct product titles/images and distinct destination URLs |
| H&M (`www2.hm.com`) | Garment detail page with multiple product photographs | One correct candidate, at least two selectable images, and the selected image in the API request |
| ASOS (`asos.com`) | Garment detail page; exercise the manual image-URL override | Original image, replacement HTTPS image, preview result and API request URL |

Across the three runs, verify a listing page with multiple distinct products, a detail page with multiple images, and a manual override. If the chosen pages do not expose those cases, change pages and record the final URLs. Do not count three pages on one domain as three sites.

## Repeatable browser procedure

1. Run `npm.cmd run check` and `npm.cmd run build --workspace @tryon/extension`. Start the API with `npm.cmd run dev:api`.
2. In Chrome, open `chrome://extensions`, enable Developer mode, load `apps/extension/dist` unpacked, and refresh each retailer tab after installing or rebuilding the extension.
3. Open the extension side panel on the target page and click **Scan page**. Record the page URL, page type, candidate count, selected title, image and source. Compare them visually with the page; a high score alone is not a pass.
4. On a listing, select two different garments and confirm the card and preview change without merging them. On a detail page, choose two images for the same garment and confirm the selected state and preview change.
5. For the override case, copy a public HTTPS image URL for the selected garment, paste it into **Image missing?**, and click **Use URL**. Confirm that a malformed or non-HTTPS URL is rejected. Do not paste URLs containing credentials or private-network hosts.
6. Upload a test profile photograph with consent, confirm the category, and generate using the default mock provider first. In the side-panel or API network inspector, verify the request's `product.imageUrl` equals the chosen image URL. Do not save request bodies or screenshots containing the person's photograph in the evidence folder.
7. After the Phase 4 Colab worker has passed its live restart test, repeat one successful public-image case with `TRYON_PROVIDER=remote`. Record whether the worker can fetch and decode the image, job completion/error, end-to-end latency, and visual garment consistency. A mock result does not prove AI quality.

## Evidence template

Copy this table into a dated test note for each site. Keep tokens, profile images and personal data out of the note.

| Field | Value |
|---|---|
| Date, browser/extension build, site domain and page URL | |
| Listing or detail; visible product/category | |
| Candidate count; expected versus observed title/image/link | |
| Number of image choices; selected URL; override URL (if used) | |
| Category detected or manually confirmed | |
| Mock request URL matched selection? Job result? | |
| Remote fetch/generation result and latency (if attempted) | |
| Screenshots of product cards/variant choice; issue link | |
| Pass/fail and reason | |

Pass the live detector acceptance only when all three distinct retailer domains produce correct candidates, including two distinct listing products and a selectable second image on a detail page. Log each false positive, missed product, duplicate, broken preview or category error with its URL and screenshot. The manual override is a usability fallback, not a substitute for detector success.

## Known limits and follow-up

- Retailers may change markup, load products only after scrolling, use shadow DOM or restrict extension content scripts. Rescan after navigation or lazy loading; site-specific adapters may be needed for recurrent failures.
- The DOM heuristic filters small/decorative images and cannot guarantee that every image choice belongs to the correct colour or product. Inspect the chosen garment before generation.
- An image displayed in Chrome may still be blocked when the remote worker downloads it, for example by hotlink protection, authentication, cookies, anti-bot controls or unsupported encoding. Use a public direct HTTPS image only; do not bypass site controls.
- Remote GPU availability, tunnel URLs and checkpoints are separate Phase 4 dependencies. Follow `docs/colab-runbook.md`; the worker restart and one real CatVTON result remain a separate acceptance gate.
- Realism, product fidelity, identity preservation and latency need measured evidence; the picker and automated tests alone do not establish those outcomes.
