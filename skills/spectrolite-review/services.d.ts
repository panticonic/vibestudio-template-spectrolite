import type { SpectroliteReviewRequest } from "./types.js";

declare module "natlang:services" {
  export const spectroliteHandoffRead: {
    evidence(): Promise<import("./types.js").VaultHandoffEvidence>;
  };
  export const spectroliteGoal: {
    inspect(): Promise<import("./types.js").OpenVaultView>;
    follow(target: string, revision: string): Promise<"followed" | "changed" | "unavailable">;
    revise(revision: string, source: string): Promise<"written" | "changed" | "unavailable">;
    evidence(checks: import("./types.js").ReviewCheck[]): Promise<SpectroliteReviewRequest>;
  };
  export const spectroliteRead: {
    observe(): Promise<SpectroliteReviewRequest>;
  };
}
