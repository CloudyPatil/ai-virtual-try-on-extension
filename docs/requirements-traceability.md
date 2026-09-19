# Assignment requirement traceability

| Requirement | Planned implementation | Verification |
|---|---|---|
| Reusable personal profile | Guided multi-photo profile stored locally | Reuse profile across two products |
| Multiple profile photograph types | Category-aware profile asset schema | Profile validation tests |
| Multiple product categories | Category registry and provider router | Demonstrate upper-body and dress/lower-body |
| Chrome extension as primary UI | Manifest V3 side panel | Installable unpacked build |
| Current-page product detection | JSON-LD Product data, product-like metadata and visible DOM heuristics | Automated tests plus the three-site browser checklist (live evidence pending) |
| Multiple products per page | Ranked candidate cards, capped at 24 | Listing-page demo with at least two distinct products |
| Multiple product images | Up to 16 URLs per candidate, gallery grouping, variant picker and HTTPS URL override | Select two different images of one product; verify the submitted URL |
| Realistic AI try-on | Remote CatVTON-compatible provider | Recorded and live generation |
| Product accuracy | Similarity checks and side-by-side source display | Quality evaluation report |
| Context-aware visualization | Optional protected-background stage | Original vs contextual result |
| Processing status | Asynchronous job state machine | UI and API integration test |
| Privacy and security | Backend secrets, explicit upload, deletion, TTL | Security checklist |
| Performance | Compression, hashing, session reuse and caching | Latency report |
| Multiple real websites | Generic detector implemented; retailer-specific adapters not yet included | Three different retailer domains and recorded pass/fail results |
| Required source/build/docs/video | Submission checklist | Release artifact audit |

