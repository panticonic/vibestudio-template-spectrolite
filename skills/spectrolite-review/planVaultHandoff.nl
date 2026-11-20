---
description: Plan a review handoff for the assigned Spectrolite document using the completed vault review.
args:
  request: "{ goal: string; path: string }"
returns: VaultHandoffPlan
---
1. Read spectroliteHandoffRead.evidence once.
2. Call chooseHandoff with request.path and the returned evidence. Return its exact plan.
