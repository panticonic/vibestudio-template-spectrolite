---
description: Review one assigned document from the installed Spectrolite vault.
args:
  request: LiveVaultRequest
returns: SpectroliteReviewReport
uses: [reviewSpectrolite/inspectDocument, reviewSpectrolite/inspectPreview]
---
1. Call readVault. Keep the actual vault, document and preview receipts together.
2. For each assigned check in order call inspectDocument or inspectPreview with that readback unchanged. Return each original finding in order.
