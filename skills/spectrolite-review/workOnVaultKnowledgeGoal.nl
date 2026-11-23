---
description: Resolve an open knowledge-work goal across the current owned Spectrolite vault.
args:
  goal: string
returns: VaultKnowledgeReport
budget: { maxTurns: 52 }
---
1. Inspect the live editor with spectroliteGoal.inspect. Keep its exact snapshot and track ordered reads, successful writes, and the actual handoff as you work.
2. Call chooseKnowledgeStep with the goal, current snapshot, recorded reads, paths whose writes succeeded, and whether a handoff was considered. Follow only an exact current visible link. After a follow or an edit call spectroliteGoal.inspect before deciding again. If revise returns changed, reread and reconstruct the edit from the current source with any new unrelated changes intact. A stale attempt never counts as a write.
3. For read call readKnowledgeNote, keep its exact returned read, and continue. For a requested handoff call stageKnowledgeHandoff with that exact current revision and the audience from the goal; keep its actual result and mark it considered even when held.
4. Once the goal is resolved, call summarizeKnowledgeWork with the goal, exact current snapshot, ordered reads, paths whose writes succeeded, and actual handoff. Pass that exact summary, current snapshot, ordered reads and actual handoff to knowledgeResult. Return its actual answer, authority path, disposition, note findings and path/revision handles. The full editor snapshots remain internal planning state.
