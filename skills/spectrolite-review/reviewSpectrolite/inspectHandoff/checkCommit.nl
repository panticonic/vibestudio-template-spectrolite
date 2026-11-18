---
description: Verify flush-first semantics against the current committed event.
args:
  request: SpectroliteReviewRequest
returns: ReviewCode
---
A dirty working copy yields dirty-before-handoff for the current requested revision. Otherwise require a committed reference of kind event and a non-null handoff eventId equal to that committed id. Use stale-handoff for a mismatch and handoff-verified when exact.
