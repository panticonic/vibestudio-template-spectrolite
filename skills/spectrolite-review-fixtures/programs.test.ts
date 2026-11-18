import { fileURLToPath } from "node:url";
import { workspaceProgramFailures } from "@workspace/natlang/testing";
import { expect, it } from "vitest";

it("compiles the Spectrolite review and its caller-bound live stages", async () => {
  const workspace = fileURLToPath(new URL("../..", import.meta.url));
  expect(await workspaceProgramFailures(workspace)).toEqual([]);
});
