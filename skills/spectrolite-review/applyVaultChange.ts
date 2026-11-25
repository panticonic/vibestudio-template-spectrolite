import { spectroliteGoal } from "natlang:services";
import { nativeVaultTarget } from "./vaultObservationHistory.js";
import type {
  OpenVaultView,
  VaultChange,
  VaultOperationObservation,
} from "./types.js";

export default async function applyVaultChange(
  before: OpenVaultView,
  change: VaultChange,
): Promise<{
  current: OpenVaultView;
  observation: VaultOperationObservation;
}> {
  if (change.kind === "follow") {
    const target = nativeVaultTarget(before, change.target),
      result = await spectroliteGoal.follow(target, before.revision);
    const current = await spectroliteGoal.inspect();
    return {
      current,
      observation: {
        kind: "follow",
        fromPath: before.path,
        fromRevision: before.revision,
        target: change.target,
        nativeTarget: target,
        result,
        path: current.path,
        revision: current.revision,
      },
    };
  }
  const result = await spectroliteGoal.revise(before.revision, change.source),
    current = await spectroliteGoal.inspect();
  return {
    current,
    observation: {
      kind: "revise",
      path: before.path,
      revision: before.revision,
      source: change.source,
      result,
      observedRevision: current.revision,
    },
  };
}
