---
description: Bind a local review receipt to the actual revision and named audience.
uses: [planVaultHandoff]
args:
  goal: string
  current: OpenVaultView
  audience: string
returns: 'VaultKnowledgeHandoff | null'
---
Call planVaultHandoff with the unchanged goal and current path. Pass the actual plan and observed revision to vaultKnowledgeHandoff.stage for the named audience. Return its receipt, or null when held.
