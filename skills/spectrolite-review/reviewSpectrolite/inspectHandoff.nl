---
description: Review receipt of an explicit Scribe handoff against the canonical committed event.
args:
  request: SpectroliteReviewRequest
returns: ReviewFinding
---
1. Use check handoff and cite vault.id then handoff.id when present. Return recipient-unassigned when scribeTarget is absent and handoff-missing when handoff is absent.
2. When the handoff phase is unsent or failed use handoff-unsent or handoff-failed respectively. Neither phase establishes dispatch.
3. Call checkAudience(request). Use its finding if one is returned. Otherwise call checkCommit(request) and use that result. Explain the specific mismatching identity or exact verified event.
