import { expect, it } from "vitest";
import { prepareSpectroliteHandoff } from "./live.js";
it("allows repeated handoff evidence reads while preserving the independently verified vault boundary", async () => {
  let ready = true;
  const observed = {
    vault: { id: "owned-vault" },
    document: { id: "owned-document", contentHash: "current" },
    preview: null,
  };
  const review = {
    request: { goal: "Review the owned vault", path: "Owned.mdx" },
    services: {},
    reference: () => ({}),
    verify: () => ({ observed, passed: ready }),
  };
  const prepared = prepareSpectroliteHandoff(
    review as never,
    [
      { kind: "domain", domain: "vault", operation: "review" },
      { kind: "domain", domain: "handoff", operation: "prepare" },
    ],
    "draft-only",
  );
  const read = prepared.services.spectroliteHandoffRead.evidence;
  const first = await read();
  expect(await read()).toEqual(first);
  first.document!.id = "invented";
  expect((await read()).document!.id).toBe("owned-document");
  ready = false;
  await expect(read()).rejects.toThrow("verifying the assigned vault");
});
