---
description: Establish whether a preview matches canonical text for the selected document.
args:
  request: SpectroliteReviewRequest
returns: "match" | "missing" | "stale"
---
Return missing when preview or document is absent. Otherwise require document.path and preview.documentPath to equal the requested path, document.repositoryId to equal the vault repositoryId, document to describe text at the same working reference kind and id, and both content hashes to match. Return match only if all match, or stale otherwise.
