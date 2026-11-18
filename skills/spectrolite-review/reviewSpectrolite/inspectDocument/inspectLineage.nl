---
description: Identify whether an external canonical file still names its tracked upstream source.
args:
  file: DocumentReviewReceipt
returns: boolean
---
Return true when file.contentClass is internal, or when it is external and file.externalKeys contains a nonempty key. External lineage may survive a local edit, a rename, or an absent authored change. The stable file identity and authored change metadata do not replace an external key.
