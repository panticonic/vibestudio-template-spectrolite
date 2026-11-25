import { beforeEach, expect, it, vi } from "vitest";
import type {
  OpenVaultView,
} from "../spectrolite-review/types.js";
import {
  nativeVaultTarget,
  observeVaultView,
} from "../spectrolite-review/vaultObservationHistory.js";
import applyVaultChange from "../spectrolite-review/applyVaultChange.js";

const mocked = vi.hoisted(() => ({
  inspect: vi.fn(),
  follow: vi.fn(),
  revise: vi.fn(),
}));
vi.mock("natlang:services", () => ({
  spectroliteGoal: {
    inspect: mocked.inspect,
    follow: mocked.follow,
    revise: mocked.revise,
  },
}));
const a: OpenVaultView = {
  path: "Index.mdx",
  revision: "a",
  source: "The current ruling is [[Ruling]].",
  visible: "Current ruling",
  links: [{ target: "Ruling", path: "records/Ruling.mdx" }],
};
const b: OpenVaultView = {
  path: "records/Ruling.mdx",
  revision: "b",
  source: "The confirmed capacity is 14. [[Index]]",
  visible: "Capacity 14",
  links: [{ target: "Index", path: "Index.mdx" }],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocked.inspect.mockResolvedValue(a);
  mocked.follow.mockResolvedValue("followed");
  mocked.revise.mockResolvedValue("written");

});

it("binds only an exact observed link label or resolved path", () => {
  expect(nativeVaultTarget(a, "records/Ruling.mdx")).toBe("Ruling");
  expect(nativeVaultTarget(a, "Ruling")).toBe("Ruling");
  expect(nativeVaultTarget(a, "somewhere/Private.mdx")).toBe(
    "somewhere/Private.mdx",
  );
});

it("returns unavailable navigation and unchanged readback to its caller", async () => {
  mocked.follow.mockResolvedValue("unavailable");
  const result = await applyVaultChange(a, {
    kind: "follow",
    target: "missing",
  });
  expect(result).toEqual({
    current: a,
    observation: {
      kind: "follow",
      fromPath: a.path,
      fromRevision: a.revision,
      target: "missing",
      nativeTarget: "missing",
      result: "unavailable",
      path: a.path,
      revision: a.revision,
    },
  });
});

it("records the attempted revision and the actual changed-revision readback", async () => {
  mocked.revise.mockResolvedValue("changed");
  const fresh = { ...a, revision: "fresh", source: "Concurrent edit." };
  mocked.inspect.mockResolvedValue(fresh);
  const result = await applyVaultChange(a, {
    kind: "revise",
    source: "Proposed edit.",
  });
  expect(mocked.revise).toHaveBeenCalledWith("a", "Proposed edit.");
  expect(result.observation).toMatchObject({
    kind: "revise",
    result: "changed",
    revision: "a",
    observedRevision: "fresh",
    source: "Proposed edit.",
  });
  expect(result.current).toEqual(fresh);
});

it("preserves distinct observations when link resolution changes at the same source revision", () => {
  const initial = observeVaultView({ views: [], operations: [] }, a);
  const changed = { ...a, links: [{ target: "Ruling", path: null }] };
  expect(observeVaultView(initial, changed).views).toEqual([a, changed]);
  expect(observeVaultView(initial, { ...a }).views).toEqual([a]);
});
