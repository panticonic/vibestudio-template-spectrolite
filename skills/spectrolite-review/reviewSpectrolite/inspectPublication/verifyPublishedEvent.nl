---
description: Establish whether the intended committed event is confirmed at protected main.
args:
  request: SpectroliteReviewRequest
returns: ReviewCode
---
Require outcome published or up-to-date and an observedMainEventId; otherwise use unconfirmed-publication. Then require relation at, a committed reference of kind event, the target event equal to the current committed id, and observedMainEventId and vault.mainEventId both equal to targetEventId. Use wrong-published-event if any of these disagree, or publication-verified if all match.
