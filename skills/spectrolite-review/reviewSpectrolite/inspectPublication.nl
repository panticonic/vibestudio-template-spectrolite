---
description: Review protected-main publication evidence for the selected Spectrolite vault.
args:
  request: SpectroliteReviewRequest
returns: ReviewFinding
---
1. Use check publication with evidenceIds containing vault.id followed by publication.id when present.
2. Call interpretProgress(request). Use its finding if one is returned. Otherwise call verifyPublishedEvent(request). Explain the exact local block, receipt failure or matching event. For publication-failed include the original nonempty lastError verbatim.
