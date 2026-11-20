---
description: Obtain current browser and vault receipts and invoke the canonical Spectrolite reviewers.
args:
  current: OpenVaultView
  checks: ReviewCheck[]
returns: SpectroliteReviewReport
uses: [reviewSpectrolite]
---
Call spectroliteGoal.evidence with checks. Pass the returned request to reviewSpectrolite unchanged. Return its findings only if the receipt covers current.path. If it does not, return no findings.
