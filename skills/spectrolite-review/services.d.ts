declare module "natlang:services" {
  export const vaultKnowledgeHandoff: {
    stage(revision: string, audience: string, plan: import("./types.js").VaultHandoffPlan): Promise<import("./types.js").VaultKnowledgeHandoff | null>;
  };
  export const spectroliteHandoffRead: {
    evidence(): Promise<import("./types.js").VaultHandoffEvidence>;
  };
  export const spectroliteGoal: {
    inspect(): Promise<import("./types.js").OpenVaultView>;
    follow(target: string, revision: string): Promise<"followed" | "changed" | "unavailable">;
    revise(revision: string, source: string): Promise<"written" | "changed" | "unavailable">;
    evidence(checks: import("./types.js").ReviewCheck[]): Promise<import("./types.js").SpectroliteReviewRequest>;
  };
  export const spectroliteRead: {
    observe(): Promise<import("./types.js").SpectroliteReviewRequest>;
  };
}
