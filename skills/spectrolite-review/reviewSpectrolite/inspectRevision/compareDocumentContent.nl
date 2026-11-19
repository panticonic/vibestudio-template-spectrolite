---
description: Identify an uncommitted change from the two canonical content hashes.
args:
  working: DocumentReviewReceipt
  committed: DocumentReviewReceipt
returns: ReviewCode
---
Return revision-unchanged when the content hashes are equal. Return draft-changed when they differ.
