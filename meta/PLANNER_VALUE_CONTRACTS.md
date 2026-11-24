# Planner value contracts

The live teacher exposed an authored contract mismatch: a chooser with no effect ports was told to follow/read/edit a complete goal, although its TypeScript caller performs those operations using the returned decision. Hiding unavailable ports correctly exposed this mismatch rather than solving it.

Inventory:

- `workOnVaultKnowledgeGoal.ts` performs follow/revise, delegates evidence and review to the authorized `readKnowledgeNote.nl`, and delegates handoff to its authorized lambda. `chooseKnowledgeStep.nl` computes only a `VaultKnowledgeStep` from observations and history.
- `workTowardVaultGoal.ts` performs follow/revise and delegates review to its authorized lambda. `chooseVaultStep.nl` computes only an `OpenVaultDecision`.
- `planVaultHandoff/chooseHandoff.nl` already describes a value computation from supplied evidence with explicit return rules; it remains unchanged.
- Effectful readers/review composers/handoff lambdas retain their existing service scopes and callable imports. Their instructions describe operations those lambdas actually own.

Both chooser bodies now describe proposed values and the coordinator's responsibility. Their frontmatter, types, service scopes, runtime budgets, user goals, fixture checks and strategy choices are unchanged. No goal-specific route, note sequence, answer or new required operation was added.

Validation: compared both frontmatter blocks byte-for-byte with the parent and checked that only these two NL bodies and this note changed. No inference test was run for prose-only changes; the existing production build validates the unchanged language/module interfaces. Live outcome remains to be observed after the next coherent release.
