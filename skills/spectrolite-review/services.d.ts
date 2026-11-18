import type { SpectroliteReviewRequest } from "./types.js";

declare module "natlang:services" {
  export const spectroliteRead: {
    observe(): Promise<SpectroliteReviewRequest>;
  };
}
