# Vault observation and operation feedback

Live collection showed repeated A/B navigation and unchanged states: the planner did not receive the previous operation's result, and knowledge planning/conclusion lost source views unless a separate review was requested. Some decisions also used an observed resolved path where native CDP navigation needs its link label.

Inventory before editing:

- Spectrolite `workOnVaultKnowledgeGoal.ts` discards follow results and unsuccessful revision results; its chooser and summary receive only current view plus explicit reviews.
- Spectrolite `workTowardVaultGoal.ts` preserves earlier views but discards operation results. Both coordinators need the same typed observation/result mechanism.
- Personal `coordinatePersonalAutomation.ts` already carries each operation's returned queue and finding into its next decision. System `workTowardDiagnosticGoal.ts` accumulates actual inspections and rejects repeated source IDs. Other loops in the eight selected skill codebases are pagination, polling, or test/reference plumbing, not repeated natural-language decisions with discarded effect results.
- Native `spectroliteGoal.follow` deliberately accepts the exact currently observed UI link label, not arbitrary paths. Normalize a planner's exact observed `link.path` to its `link.target` at the program/service boundary; keep native revision/authority checks and unknown-target refusal intact.
- Goal fixtures, scenarios, expected answers and independent observation/review checks remain unchanged. This is program feedback, not an imposed route or an extra review requirement.

Decomposition:

- Natural-language choosers decide the next domain action from the goal, current view, actual prior views, explicit review evidence and operation results.
- The natural-language conclusion uses all inspected source views as well as genuine review receipts. A source inspection is not a preview/revision review.
- Crisp helpers retain unique actual views and append typed operation results immutably; no transcript or expected task solution is fabricated.
- Crisp coordinators perform the selected bounded native operation and record its result and readback before asking again. Existing lifetime guards are retained; no new planning limit or prescribed route is introduced.

Validation covers unresolved navigation, stale revisions, resolved-path binding, A/B revisits retaining observed evidence, and conclusion inputs without manufacturing extra review receipts. The current frozen V27 remains untouched.
