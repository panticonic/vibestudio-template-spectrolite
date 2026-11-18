---
description: Compare Scribe receipt path, intended recipient and captured selection.
args:
  request: SpectroliteReviewRequest
returns: ReviewCode | null
---
Use wrong-document when handoff.documentPath differs from request.path. Use wrong-recipient when handoff.recipientId differs from scribeTarget.recipientId. Use wrong-selection when the selections differ, including a missing selection when one was expected. Evaluate in that order and return null if all match.
