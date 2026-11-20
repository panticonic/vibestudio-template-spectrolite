# Open goals in Spectrolite

The shared workspace root can call this installed skill with the user's request.
The owned panel exposes the active document and visible wikilinks. The vault
service separately supplies durable document provenance and exact scoped writes.

| Part | Implementation |
| --- | --- |
| Decide what the user needs and when to stop navigating | A Natlang callable owns the observe, decide, act, and readback loop. A child chooses the next action from the observed editor and prior steps. |
| Reconcile a requested revision with linked evidence | The decision callable receives the current source, the already observed notes, and the user's goal. It proposes a narrow edit against the visible document revision. |
| Observe and follow a link | The service checks the current renderer identity, observed revision and canonical link resolution, and activates the visible link using CDP. It independently reads the destination. |
| Persist a working draft | The service checks the context, document and working revision, then submits a scoped semantic VCS edit. The editor must observe that same text before it can be reported. |
| Check document, preview, navigation and revision evidence | A Natlang child selects appropriate checks and delegates to the existing reviewSpectrolite tree. The service assembles receipts from current renderer and VCS observations. |
| Verify effects | The harness checks the exact observed route, outcome, current working and committed sources, retained browser identity and unrelated documents. |
