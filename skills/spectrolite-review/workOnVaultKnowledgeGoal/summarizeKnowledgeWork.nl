---
description: Give the user the evidence-backed result across the reviewed vault.
args:
  goal: string
  current: OpenVaultView
  reads: VaultKnowledgeRead[]
  writtenPaths: string[]
  handoff: 'VaultKnowledgeHandoff | null'
  history: VaultObservationHistory
returns: '{ outcome: VaultKnowledgeOutcome; authorityPath: string | null; answer: string }'
---
Explain the result using all actual inspected source views in history, the explicit read/review evidence, successful writes and actual handoff receipt. Include the decisive wording, record labels or provenance requested by the user, including evidence observed in a note that is no longer open. Distinguish source inspection from committed-copy or rendered-preview evidence. Name relevant paths and what changed. For authority-confirmed set authorityPath to the exact observed source whose evidence establishes authority; for other dispositions use null. Use the disposition that matches the user's primary goal, with handoff-staged only for an actual receipt and handoff-held when the requested handoff cannot be staged. Use edited for an accomplished correction supported by its recorded operation result and readback. Preserve the limits of the actual evidence.
