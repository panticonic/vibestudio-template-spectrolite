---
description: Identify unresolved wiki links from the panel's canonical parser and target resolver.
args:
  file: DocumentReviewReceipt
returns: string[]
---
Return the target of each link whose resolvedPath is null. The canonical parser has already excluded code fences and collapsed duplicates. Preserve its decoded target text.
