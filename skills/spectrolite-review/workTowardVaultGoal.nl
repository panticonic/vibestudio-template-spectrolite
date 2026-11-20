---
description: Navigate, revise, and check documents in the current Spectrolite vault.
args:
  goal: string
returns: OpenVaultReport
budget: { maxTurns: 36 }
---
1. Call spectroliteGoal.inspect. Keep the visible editor, canonical source, revision and links it returns as the current observation. Keep previous distinct observations as evidence for this goal.
2. Call chooseVaultStep with the goal, current observation and previous observations, and with whether a revision has been written. For follow, call spectroliteGoal.follow with the selected visible target and current revision. For revise, call spectroliteGoal.revise with the current revision and complete revised source. After either action, inspect again before deciding the next step. If the service reports a changed or unavailable result, reconsider from the new observations.
3. For review, call reviewCurrentVault with the current observation and selected checks. Return the current path and revision and its actual findings, with status edited only when a write succeeded. For blocked return the decision's actual reason.
