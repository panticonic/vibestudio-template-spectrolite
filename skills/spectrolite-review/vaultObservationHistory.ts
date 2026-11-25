import type {
  OpenVaultView,
  VaultObservationHistory,
  VaultOperationObservation,
} from "./types.js";

export function observeVaultView(
  history: VaultObservationHistory,
  view: OpenVaultView,
): VaultObservationHistory {
  const seen = history.views.some(
    (prior) =>
      prior.path === view.path &&
      prior.revision === view.revision &&
      prior.source === view.source &&
      prior.visible === view.visible &&
      JSON.stringify(prior.links) === JSON.stringify(view.links),
  );
  return seen ? history : { ...history, views: [...history.views, view] };
}

export function observeVaultOperation(
  history: VaultObservationHistory,
  operation: VaultOperationObservation,
): VaultObservationHistory {
  return { ...history, operations: [...history.operations, operation] };
}

/** Bind only an exact currently observed link identity; never guess a path. */
export function nativeVaultTarget(view: OpenVaultView, target: string): string {
  const link =
    view.links.find((item) => item.target === target) ??
    view.links.find((item) => item.path !== null && item.path === target);
  return link?.target ?? target;
}
