---
description: Verify that browser-observed wiki-link hops lead to the assigned vault document.
args:
  request: SpectroliteReviewRequest
returns: ReviewFinding
---
Return check navigation. Start evidenceIds with the vault id and the document id when available. With no navigation receipt or no hops, return navigation-missing. Add the receipt id when it exists.

For a recorded route, check that every hop names its source, chosen target and observed destination. Each later source must match the previous destination. The last destination, the selected document path, and the requested path must agree. Require the document's repository and reference to match the vault's repository and working reference. If any requirement fails, return navigation-unverified and explain the mismatch. Otherwise return navigation-ready and name the full paths from the starting document through every destination, in order.
