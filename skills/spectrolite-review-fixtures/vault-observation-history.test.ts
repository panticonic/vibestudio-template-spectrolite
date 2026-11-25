import { beforeEach, expect, it, vi } from "vitest";
import type {
  OpenVaultView,
  VaultKnowledgeStep,
  VaultObservationHistory,
} from "../spectrolite-review/types.js";
import {
  nativeVaultTarget,
  observeVaultView,
} from "../spectrolite-review/vaultObservationHistory.js";
import applyVaultChange from "../spectrolite-review/applyVaultChange.js";
import workOnVaultKnowledgeGoal from "../spectrolite-review/workOnVaultKnowledgeGoal.js";
import workTowardVaultGoal from "../spectrolite-review/workTowardVaultGoal.js";

const mocked = vi.hoisted(() => ({
  inspect: vi.fn(),
  follow: vi.fn(),
  revise: vi.fn(),
  choose: vi.fn(),
  summarize: vi.fn(),
  chooseReview: vi.fn(),
  review: vi.fn(),
  read: vi.fn(),
  handoff: vi.fn(),
}));
vi.mock("natlang:services", () => ({
  spectroliteGoal: {
    inspect: mocked.inspect,
    follow: mocked.follow,
    revise: mocked.revise,
  },
}));
vi.mock(
  "../spectrolite-review/workOnVaultKnowledgeGoal/chooseKnowledgeStep.nl",
  () => ({ default: mocked.choose }),
);
vi.mock(
  "../spectrolite-review/workOnVaultKnowledgeGoal/summarizeKnowledgeWork.nl",
  () => ({ default: mocked.summarize }),
);
vi.mock(
  "../spectrolite-review/workOnVaultKnowledgeGoal/readKnowledgeNote.nl",
  () => ({ default: mocked.read }),
);
vi.mock(
  "../spectrolite-review/workOnVaultKnowledgeGoal/stageKnowledgeHandoff.nl",
  () => ({ default: mocked.handoff }),
);
vi.mock("../spectrolite-review/workTowardVaultGoal/chooseVaultStep.nl", () => ({
  default: mocked.chooseReview,
}));
vi.mock(
  "../spectrolite-review/workTowardVaultGoal/reviewCurrentVault.nl",
  () => ({ default: mocked.review }),
);

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
  mocked.summarize.mockResolvedValue({
    outcome: "authority-confirmed",
    authorityPath: b.path,
    answer: "Confirmed capacity 14.",
  });
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

it("retains both sides of a revisit and gives the conclusion actual source without inventing reviews", async () => {
  const choices: VaultKnowledgeStep[] = [
    { kind: "follow", target: "records/Ruling.mdx" },
    { kind: "follow", target: "Index" },
    { kind: "finish" },
  ];
  mocked.choose.mockImplementation(async () => choices.shift());
  mocked.inspect
    .mockResolvedValueOnce(a)
    .mockResolvedValueOnce(b)
    .mockResolvedValueOnce(a);
  const report = await workOnVaultKnowledgeGoal(
    "What is the confirmed capacity?",
  );
  expect(mocked.follow.mock.calls).toEqual([
    ["Ruling", "a"],
    ["Index", "b"],
  ]);
  const history = mocked.summarize.mock.calls[0]![5] as VaultObservationHistory;
  expect(history.views).toEqual([a, b]);
  expect(
    history.operations.map((row) => row.kind === "follow" && row.result),
  ).toEqual(["followed", "followed"]);
  expect(mocked.read).not.toHaveBeenCalled();
  expect(report.reads).toEqual([]);
  expect(report.answer).toContain("14");
  expect(mocked.choose.mock.calls[0]![5].operations).toEqual([]);
  expect(mocked.choose.mock.calls[1]![5].operations).toHaveLength(1);
});

it("supplies rejected navigation and revision feedback to the next knowledge decision", async () => {
  const choices: VaultKnowledgeStep[] = [
    { kind: "follow", target: "missing" },
    { kind: "revise", source: "Proposed edit." },
    { kind: "finish" },
  ];
  mocked.choose.mockImplementation(async () => choices.shift());
  mocked.follow.mockResolvedValue("unavailable");
  mocked.revise.mockResolvedValue("changed");
  await workOnVaultKnowledgeGoal(
    "Update the authorized note if its authority is established.",
  );
  const afterFollow = mocked.choose.mock
    .calls[1]![5] as VaultObservationHistory;
  expect(afterFollow.operations[0]).toMatchObject({
    kind: "follow",
    result: "unavailable",
    path: a.path,
  });
  const afterRevision = mocked.choose.mock
    .calls[2]![5] as VaultObservationHistory;
  expect(afterRevision.operations[1]).toMatchObject({
    kind: "revise",
    result: "changed",
  });
  expect(mocked.summarize.mock.calls[0]![3]).toEqual([]);
});

it("uses the same actual feedback contract for the review coordinator", async () => {
  mocked.chooseReview
    .mockResolvedValueOnce({ kind: "follow", target: "missing" })
    .mockResolvedValueOnce({
      kind: "blocked",
      reason: "No accessible evidence.",
    });
  mocked.follow.mockResolvedValue("unavailable");
  expect(await workTowardVaultGoal("Review the ruling.")).toEqual({
    status: "blocked",
    reason: "No accessible evidence.",
  });
  expect(mocked.chooseReview.mock.calls[1]![2].operations[0]).toMatchObject({
    kind: "follow",
    result: "unavailable",
  });
});

it("preserves distinct observations when link resolution changes at the same source revision", () => {
  const initial = observeVaultView({ views: [], operations: [] }, a);
  const changed = { ...a, links: [{ target: "Ruling", path: null }] };
  expect(observeVaultView(initial, changed).views).toEqual([a, changed]);
  expect(observeVaultView(initial, { ...a }).views).toEqual([a]);
});
