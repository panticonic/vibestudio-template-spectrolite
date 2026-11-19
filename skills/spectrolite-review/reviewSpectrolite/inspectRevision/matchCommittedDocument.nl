---
description: Verify that the working and committed receipts are for the same file at the assigned vault refs.
args:
  request: SpectroliteReviewRequest
returns: boolean
---
Require both documents and match both repository ids to request.vault.repositoryId. Match both paths to request.path and match the stable file ids to one another. Match the working document's reference kind and id to vault.working, and the committed document's reference kind and id to vault.committed. Return true when all comparisons hold.
