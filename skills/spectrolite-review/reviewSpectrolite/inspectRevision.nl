---
description: Compare the assigned working document with the committed copy of the same vault file.
args:
  request: SpectroliteReviewRequest
returns: ReviewFinding
---
1. Set check to revision. List evidenceIds in vault, working document, committed document order, including each receipt only if present.
2. Call matchCommittedDocument(request). If it returns false, use revision-unverified and describe the missing or mismatched receipt.
3. Call compareDocumentContent with request.document and request.committedDocument. Use its returned code. Name the document path in detail and describe whether it differs from the committed copy.
