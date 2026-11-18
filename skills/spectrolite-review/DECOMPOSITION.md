# Spectrolite vault review

The workflow turns one exact vault readback into recommendations for the selected document and branch. It covers document integrity, live preview, Scribe handoff, and protected-main publication. The report carries references to the supplied receipts so the caller can find the evidence.

| Product boundary | Implementation |
| --- | --- |
| `VaultSemanticVcs.refresh()` and `readFile()` | The receipt projector copies the working reference, committed reference, protected-main event, file identity, content hash and semantic lineage. |
| `parseFrontmatter()` and wiki links | The same exact product parsers extract the title, dependencies and link targets from canonical MDX. The document skill distinguishes missing links, source classes and revision mismatches. |
| `LiveJsxEditor` | The preview skill separates compilation and render outcomes, scopes them to the host-supplied document content hash and rejects stale observations. |
| `sendToScribe()` | The handoff skill compares intended and observed recipients, selection and committed event. The workflow reports a disposition using those receipts. |
| `PublishController` | The publication skill distinguishes working-copy, protected-main integration and confirmed publication. Successful sync or a clean working copy alone is insufficient evidence of the targeted event. |
| Combined review | The root chooses the requested review stages and leaves caller operations to the existing panel. |

The input carries only caller-projected evidence. Binary files and missing receipts remain distinguishable. Private panel view state is outside the canonical vault text, and the workflow has no ability to publish, alter source or dispatch a message.

The live branch receives the selected path and checks. A caller-bound leaf reads
canonical VCS state and the installed editor's preview. It passes that exact
evidence to the same document and preview subtrees. The caller owns the
disposable editing context, document navigation, and the independent outcome
check. The process uses original editor rendering for observed phases and the
canonical VCS receipt for identity and provenance.
