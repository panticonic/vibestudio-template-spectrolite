import type { SpectroliteReviewReport } from "../spectrolite-review/types.js";
import type { SpectroliteWorld } from "./worlds.js";

export function verifySpectroliteWorld(
  world: SpectroliteWorld,
  observed: SpectroliteReviewReport,
): boolean {
  return (
    observed.findings.length === world.expected.length &&
    world.expected.every((expected, index) => {
      const finding = observed.findings[index];
      return (
        finding?.check === expected.check &&
        finding.code === expected.code &&
        finding.evidenceIds.length === expected.evidenceIds.length &&
        finding.evidenceIds.every(
          (id, position) => id === expected.evidenceIds[position],
        ) &&
        finding.detail.trim().length > 0 &&
        expected.detailIncludes.every((part) => finding.detail.includes(part))
      );
    })
  );
}
