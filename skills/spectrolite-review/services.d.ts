import type { SpectroliteReviewRequest } from "./types.js";

declare module "natlang:services" {
  export const spectroliteHandoffRead: {
    evidence(): Promise<import("./types.js").VaultHandoffEvidence>;
  };
  export const spectroliteRead: {
    observe(): Promise<SpectroliteReviewRequest>;
  };
}
