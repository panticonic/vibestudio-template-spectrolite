---
description: Map a matching preview observation to its observed phase.
args:
  preview: PreviewReviewReceipt
returns: ReviewCode
---
Use preview-ready for rendered, preview-pending for pending, or preserve compile-error or render-error exactly. A compiled component may still fail on render. Preserve the supplied error detail in later reporting.
