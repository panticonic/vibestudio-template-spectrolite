---
description: Join an exact current note to the canonical Spectrolite review.
uses: [reviewSpectrolite]
args:
  view: OpenVaultView
  checks: ReviewCheck[]
returns: VaultKnowledgeRead
---
Call spectroliteGoal.evidence with the requested checks. Pass the returned request to reviewSpectrolite unchanged. Return the actual view and review for the current path.
