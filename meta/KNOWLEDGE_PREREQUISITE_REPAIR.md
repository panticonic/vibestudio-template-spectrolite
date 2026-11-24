# Native vault prerequisite repair

The V19 native reference `vault-repair-access-directions-across-public-and-internal-cards`
completed both correct native writes, preserved both reminders and committed state,
read back both documents, and passed every independent check except `exactVaultRoute`.
Its actual event journal places the first edit at event 3 and the correctly rendered
post-edit document/preview/revision proof at event 4. The second edit is event 7 and
its readback event 8. There were no teacher/model calls.

`skills/spectrolite-review-fixtures/knowledge-graph.ts` selected prerequisite reads by
path from the *whole* reference. The default prerequisite path list came from the
reference before its first write, but selecting that path again across the whole
reference pulled in the edited card's later `draft-changed` and preview proofs.
The first write was consequently required to possess proof of its future result.
A multiset additionally demanded two copies of repeated document proof before the
write. This predicts the observed failure with the correct native final state.

Prerequisites now come only from the prefix before the first mutation. Explicit
basis paths absent from that prefix are rejected rather than silently omitted.
Proof coverage is set coverage: splitting or combining checks and repeating an
observation do not change its meaning. All required proof kinds remain required,
including the post-edit evidence before a handoff. Each successful write still needs
its native document read before and after it, and its authority proofs before it.

Mutation inventory: `GraphEvent` and managed `Step` permit only `write` as a source
mutation. The managed wrapper appends it only after `spectroliteGoal.revise` returns
`written`; rejected CAS/stale attempts do not create it. `follow` is navigation.
Private handoff staging is separately bounded by `handoffAt`, recorded before its
persisted receipt; no write may occur at or after that boundary. Native path,
revision, readback, receipt/hash, ownership, scope, protected/committed state and
forgery-rejection checks are unchanged. Neither task goals nor cases changed.

## Shared mechanism inventory before editing

All eight exact V19 template sources were searched. Only Spectrolite's
`knowledge-graph.ts` implements path-selected read prerequisites; its one caller is
`knowledge-managed.ts`, used by all 50 vault knowledge worlds, including the explicit
20 graph worlds. The common Base outcome package only projects verified checks;
it does not impose event order. Personal, Examples, News and Google Workspace have
no implementation/consumer of this prerequisite-selection mechanism.

Equivalent and candidate validators inspected separately:

- Spectrolite `open-goal.ts:284` checks expected native hop membership and observed
  destinations. Its navigation worlds explicitly request following linked records
  and reporting that path; this is distinct from demanding duplicate read calls.
- System Testing `semantic-evidence.ts:3` already uses set membership and permits
  reordered/repeated reads. Notification, session-replay and authority-boundary
  callers use that mechanism rather than multiset equality.
- System `remote-commission-fixtures/fixture.ts:19` gates stages on current,
  operation-owned receipts. Deployment verify requires the successful install;
  handoff requires verified deployment or admitted existing identity; access profile,
  pairing, route and child verification consume those receipts. Its exact stage
  check is not this path-selected future-proof mechanism.
- System Testing `presentation-managed.ts:241` checks rendered view order, a visible
  presentation product, rather than a model/service invocation trajectory.
- System Testing `checklist-managed.ts:228` and `open-goal-terminal-managed.ts:322`
  check native mutation/screen sequences. Checked checklist goals explicitly request
  ordered toggles, withdrawal before new approval, and reattach/restart readback.
- System Testing `open-goal-client-diagnostics-managed.ts:65` already treats ordinary
  observations as coverage. Mutating viewport/click/reload steps are compared in
  order; checked worlds request phone-width testing followed by desktop restoration.
- Distinct route-authority and deployed-interface validators bind declared scope,
  assigned routes/provider evidence, native readback and handoff provenance. This
  repair does not remove those authority checks.

The wider predicate search also found exact frontier counts in Image, News, API,
Editorial and Personal Welcome fixtures and allowed-effect set checks in extension,
package/release, archive and webhook fixtures. Those predicates do not select future
read proofs by path. Their complete per-world user/protocol justification has not
been audited here; this is not a finding that all wider validators are free of
trajectory constraints. The retained search inventory records that remaining scope.

## Focused evidence

Host-owned, model-free tests passed: seven knowledge graph regressions plus two
archived/native-reference replays. The unchanged captured first-failure journal is
rejected by the old graph and accepted by the repaired graph; removing its authority
read still rejects. All 50 unchanged authored reference event graphs pass. Exactly
eight previously failed reference graphs are corrected, matching all eight names in
the actual native failure packet. Full fresh native qualification belongs to the
successor source pin; the V19 packets remain unchanged.
