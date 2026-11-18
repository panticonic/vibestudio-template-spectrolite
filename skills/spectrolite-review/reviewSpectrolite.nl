---
description: Review canonical Spectrolite vault evidence and give a grounded document, preview, handoff or publication disposition.
args:
  request: SpectroliteReviewRequest
returns: SpectroliteReviewReport
budget: { maxTurns: 30 }
---
1. Use request.checks as the ordered list of requested boundaries. For document call inspectDocument, for preview call inspectPreview, for handoff call inspectHandoff, and for publication call inspectPublication. Each receives request.
2. Return those findings in the same order. Each finding refers to the original receipt ids. Keep its disposition and detail intact, including unsuccessful, pending and missing evidence.
