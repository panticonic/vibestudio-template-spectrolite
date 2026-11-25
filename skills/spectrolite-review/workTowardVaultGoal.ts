import { spectroliteGoal } from "natlang:services";
import chooseVaultStep from "./workTowardVaultGoal/chooseVaultStep.nl";
import reviewCurrentVault from "./workTowardVaultGoal/reviewCurrentVault.nl";
import {
  observeVaultView,
  observeVaultOperation,
} from "./vaultObservationHistory.js";
import applyVaultChange from "./applyVaultChange.js";
import type {
  OpenVaultReport,
  OpenVaultDecision,
  VaultObservationHistory,
} from "./types.js";
export default async function workTowardVaultGoal(
  goal: string,
): Promise<OpenVaultReport> {
  let current = await spectroliteGoal.inspect(),
    edited = false;
  let history: VaultObservationHistory = observeVaultView(
    { views: [], operations: [] },
    current,
  );
  for (let remaining = 36; remaining > 0; remaining--) {
    const step: OpenVaultDecision = await chooseVaultStep(
      goal,
      current,
      history,
      edited,
    );
    if (step.kind === "blocked")
      return { status: "blocked", reason: step.reason };
    if (step.kind === "review")
      return {
        status: edited ? "edited" : "reviewed",
        path: current.path,
        revision: current.revision,
        review: await reviewCurrentVault(current, step.checks),
      };
    const change = await applyVaultChange(current, step);
    edited =
      (change.observation.kind === "revise" &&
        change.observation.result === "written") ||
      edited;
    current = change.current;
    history = observeVaultView(
      observeVaultOperation(history, change.observation),
      current,
    );
  }
  throw new Error(
    "The vault navigation planning budget was exhausted before completion",
  );
}
