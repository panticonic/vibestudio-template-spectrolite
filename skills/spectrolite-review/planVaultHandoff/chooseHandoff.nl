---
description: Select the exact revision a reviewer can use and classify what the rendered preview establishes.
args:
  path: string
  evidence: VaultHandoffEvidence
returns: VaultHandoffPlan
---
1. Check that document.path equals path, document.repositoryId equals vault.repositoryId, and document.ref matches vault.working. Check that preview is rendered for that path and document.contentHash. If a check fails, return hold with null ref and contentHash. Cite only the receipts you checked.
2. Confirm committedDocument names the same file in the same repository and its ref matches vault.committed. If this fails, return hold and cite the available receipts.
3. Choose committed-review for a clean vault when both documents have the same content hash. Otherwise choose draft-only. Carry document.ref and document.contentHash into the plan. Cite vault, document, committedDocument, then preview by ID.
