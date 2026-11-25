import { spectroliteGoal } from "natlang:services";
import chooseKnowledgeStep from "./workOnVaultKnowledgeGoal/chooseKnowledgeStep.nl";
import readKnowledgeNote from "./workOnVaultKnowledgeGoal/readKnowledgeNote.nl";
import stageKnowledgeHandoff from "./workOnVaultKnowledgeGoal/stageKnowledgeHandoff.nl";
import summarizeKnowledgeWork from "./workOnVaultKnowledgeGoal/summarizeKnowledgeWork.nl";
import knowledgeResult from "./workOnVaultKnowledgeGoal/knowledgeResult.js";
import {
  observeVaultView,
  observeVaultOperation,
} from "./vaultObservationHistory.js";
import applyVaultChange from "./applyVaultChange.js";
import type {
  VaultKnowledgeReport,
  VaultKnowledgeRead,
  VaultKnowledgeHandoff,
  VaultKnowledgeStep,
  VaultObservationHistory,
} from "./types.js";
export default async function workOnVaultKnowledgeGoal(
  goal: string,
): Promise<VaultKnowledgeReport> {
  let current = await spectroliteGoal.inspect(),
    handoff: VaultKnowledgeHandoff | null = null,
    handoffConsidered = false;
  const reads: VaultKnowledgeRead[] = [],
    writtenPaths: string[] = [];
  let history: VaultObservationHistory = observeVaultView(
    { views: [], operations: [] },
    current,
  );
  // Preserve the authored coordinator's finite planning budget without manufacturing a completion.
  for (let remaining = 52; remaining > 0; remaining--) {
    const step: VaultKnowledgeStep = await chooseKnowledgeStep(
      goal,
      current,
      reads,
      writtenPaths,
      handoffConsidered,
      history,
    );
    if (step.kind === "finish")
      return knowledgeResult(
        await summarizeKnowledgeWork(
          goal,
          current,
          reads,
          writtenPaths,
          handoff,
          history,
        ),
        current,
        reads,
        handoff,
      );
    if (step.kind === "read") {
      reads.push(await readKnowledgeNote(current, step.checks));
      continue;
    }
    if (step.kind === "handoff") {
      handoff = await stageKnowledgeHandoff(goal, current, step.audience);
      handoffConsidered = true;
      continue;
    }
    const change = await applyVaultChange(current, step);
    if (
      change.observation.kind === "revise" &&
      change.observation.result === "written" &&
      !writtenPaths.includes(change.observation.path)
    )
      writtenPaths.push(change.observation.path);
    current = change.current;
    history = observeVaultView(
      observeVaultOperation(history, change.observation),
      current,
    );
  }
  throw new Error(
    "The vault knowledge planning budget was exhausted before completion",
  );
}
