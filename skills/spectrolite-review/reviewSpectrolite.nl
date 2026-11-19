---
description: Review canonical Spectrolite vault evidence and give a grounded document, preview, handoff or publication disposition.
args:
  request: SpectroliteWorkflowRequest
returns: SpectroliteReviewReport
budget: { maxTurns: 30 }
---
For a live-vault request, call reviewLiveVault with that assignment and return its report. For supplied receipts follow these steps.

1. Use request.checks as the ordered list of requested boundaries. Call inspectDocument, inspectPreview, inspectNavigation, inspectHandoff, or inspectPublication for the matching boundary. Each receives request.
2. Return those findings in the same order. Each finding refers to the original receipt ids. Keep its disposition and detail intact, including unsuccessful, pending and missing evidence.
