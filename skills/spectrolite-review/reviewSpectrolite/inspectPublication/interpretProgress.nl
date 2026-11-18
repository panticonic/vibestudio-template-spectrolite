---
description: Separate active publication, unresolved conflicts, and earlier working-copy phases.
args:
  request: SpectroliteReviewRequest
returns: ReviewCode | null
---
Use the first matching disposition in order.
1. If a receipt records conflicts, use conflict-unresolved.
2. If it is publishing, use publication-pending.
3. If its outcome is error or it records lastError, use publication-failed.
4. If vault.clean is false, use working-copy-dirty. If relation is behind or diverged, use integration-required.
5. If publication is absent, use publication-missing. Otherwise use null so the event can be checked.
