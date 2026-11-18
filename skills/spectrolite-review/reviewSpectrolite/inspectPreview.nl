---
description: Interpret preview evidence for the assigned canonical revision.
args:
  request: SpectroliteReviewRequest
returns: ReviewFinding
---
1. Use check preview. Start evidenceIds with vault.id, then append document.id and preview.id when present.
2. Call matchPreview(request). Use preview-missing if observation is missing, stale-preview if its identity cannot establish a preview of the current assigned document. Otherwise use classifyPreview with the present preview. Explain the actual phase or unmatched identity. Include the original nonempty failure detail verbatim for a current compile or render failure.
