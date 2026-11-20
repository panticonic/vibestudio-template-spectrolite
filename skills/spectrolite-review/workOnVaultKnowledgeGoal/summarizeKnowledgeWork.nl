---
description: Give the user the evidence-backed result across the reviewed vault.
args:
  goal: string
  current: OpenVaultView
  reads: VaultKnowledgeRead[]
  writtenPaths: string[]
  handoff: 'VaultKnowledgeHandoff | null'
returns: '{ outcome: VaultKnowledgeOutcome; authorityPath: string | null; answer: string }'
---
Explain which linked evidence determines the result and which contradictory or retired evidence cannot be relied upon. Include the exact decisive wording, record labels or provenance that the user needs. Distinguish working copy, committed copy, and actual rendered preview. Name relevant paths and what changed. For authority-confirmed set authorityPath to the exact path of the authoritative reviewed record. For all other dispositions use null. Use the disposition that matches the user's primary goal, with handoff-staged only for an actual receipt and handoff-held when the requested handoff cannot be staged. Use edited for an accomplished correction, otherwise the exact evidence disposition. Never infer a completed write or a rendered component from a source string alone.
