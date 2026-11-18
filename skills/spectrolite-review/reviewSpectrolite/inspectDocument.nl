---
description: Determine whether the assigned canonical document and its provenance are usable.
args:
  request: SpectroliteReviewRequest
returns: ReviewFinding
---
1. Start with check document and evidenceIds containing vault.id followed by document.id when present.
2. When document is absent use document-missing. When repositoryId or path disagrees with the assignment use wrong-document. When ref kind or id differs from vault.working use stale-document. When the receipt is not text use non-text. Return immediately on the first of these.
3. Call inspectLineage(document). When it identifies missing provenance return lineage-missing. Otherwise call inspectLinks(document) and use broken-link when any target is unresolved. Use document-ready otherwise. In detail name the actual path or provenance field, and preserve every unresolved target verbatim.
