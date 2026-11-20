import { beforeEach, expect, it, vi } from "vitest";
import { prepareOpenSpectroliteGoal, type OpenSpectroliteScene } from "./open-goal.js";

const unresolved: OpenSpectroliteScene = {
  id: "check-catalog-link-before-print", goal: "Check the link.", openPath: "Catalog Withdrawal.mdx",
  files: { "Catalog Withdrawal.mdx": "The supporting file is [[Withdrawn Collections Ruling]]." },
  expected: { path: "Catalog Withdrawal.mdx", route: [], findings: [["document", "broken-link"]] },
};
const alias: OpenSpectroliteScene = {
  id: "inspect-archive-intake-preview", goal: "Check the accession note.", openPath: "Archive Index.mdx",
  files: { "Archive Index.mdx": "Open [[Accession Intake]].", "records/Accession Intake.mdx": "Plain instructions." },
  expected: { path: "records/Accession Intake.mdx",
    route: [{ from: "Archive Index.mdx", target: "Accession Intake", to: "records/Accession Intake.mdx" }],
    findings: [["document", "document-ready"], ["navigation", "navigation-ready"], ["preview", "preview-missing"]],
  },
};

const state = vi.hoisted(() => ({
  path: "Catalog Withdrawal.mdx",
  generation: { protocol: "panel-cdp-generation.v1", panelId: "panel", attemptId: "attempt", buildKey: "build" },
  source: {} as Record<string, string>,
  actions: [] as string[],
  contextId: "context",
}));
const ref = { kind: "event", eventId: "commit" };
vi.mock("@workspace/testkit", () => ({
  waitFor: async (fn: () => Promise<unknown>) => {
    const value = await fn();
    if (value === undefined) throw new Error("No stable observation");
    return value;
  },
}));
vi.mock("@workspace/runtime", () => ({
  vcs: {
    status: async () => ({ mainEventId: "main", workingHead: ref, committed: ref }),
    readFile: async ({ file }: { file: { path: string } }) => ({
      fileId: file.path, content: { kind: "text", text: state.source[file.path] },
    }),
  },
  panelTree: { get: () => ({
    observe: async () => ({ ...state.generation, kind: "workspace", contextId: state.contextId,
      requestedRef: "ctx:context", source: "panels/spectrolite" }),
    cdp: { session: async () => ({
      receipt: { generation: state.generation },
      close: async () => {},
      page: { evaluate: async (expression: string) => {
        if (expression.includes("link.click()")) {
          const to = Object.keys(state.source).find(path => path !== state.path && expression.includes(`getAttribute('title') === ${JSON.stringify(path)}`));
          if (!to) return false;
          state.actions.push(to);
          state.path = to;
          return true;
        }
        return { path: state.path, text: state.source[state.path], preview: [],
          links: links(state.path).map(({ target, resolvedPath }) => ({ target, title: resolvedPath ?? `Click to create [[${target}]]` })) };
      } },
    }) },
  }) },
}));

function links(path: string) {
  return Array.from(state.source[path]?.matchAll(/\[\[([^\]]+)\]\]/gu) ?? [], ([, target]) => ({
    target: target!,
    resolvedPath: Object.keys(state.source).find(key => key.split("/").at(-1) === target + ".mdx") ?? null,
  }));
}
vi.mock("@workspace-panels/spectrolite/review-evidence", () => ({
  observeVaultReview: async ({ path }: { path: string }) => ({
    vault: { id: "vault", repositoryId: "repo", working: { kind: "event", id: "commit" },
      committed: { kind: "event", id: "commit" } },
    document: { id: "doc", fileId: path, links: links(path), contentHash: state.source[path] },
  }),
  projectDocumentReviewReceipt: () => null,
}));

beforeEach(() => { state.actions = []; state.contextId = "context"; });
async function useWorld(world: OpenSpectroliteScene) {
  state.path = world.openPath;
  state.source = { ...world.files };
  return prepareOpenSpectroliteGoal({ contextId: "context", caseId: world.id, panelId: "panel" }, world);
}

it("reports a broken link without invoking the renderer route that would create a note", async () => {
  const prepared = await useWorld(unresolved);
  const { spectroliteGoal } = prepared.services;
  const view = await spectroliteGoal.inspect();
  expect(await spectroliteGoal.follow("Withdrawn Collections Ruling", view.revision)).toBe("unavailable");
  expect(await spectroliteGoal.revise(view.revision, "corrupt")).toBe("unavailable");
  expect(state.actions).toEqual([]);
  expect((await prepared.qualify()).passed).toBe(true);
  expect((await prepared.verify({ status: "workspace-skill-reviewed", skill: "spectrolite", outcome: {
    status: "reviewed", path: view.path, revision: view.revision,
    review: { findings: [{ check: "document", code: "document-ready", detail: "All links resolved", evidenceIds: ["vault", "doc"] }] },
  } })).checks.canonicalReviewFindings).toBe(false);
});

it("binds a selected wiki alias to the resolved canonical path and rejects a stale observation", async () => {
  const prepared = await useWorld(alias);
  const { spectroliteGoal } = prepared.services;
  const view = await spectroliteGoal.inspect();
  expect(await spectroliteGoal.follow("records/Accession Intake.mdx", view.revision)).toBe("unavailable");
  expect(await spectroliteGoal.follow("Accession Intake", "older-version")).toBe("changed");
  expect((await prepared.qualify()).passed).toBe(true);
  expect(state.actions).toEqual(["records/Accession Intake.mdx"]);
});

it("rejects a panel owned by another context", async () => {
  const prepared = await useWorld(unresolved);
  state.contextId = "foreign";
  await expect(prepared.services.spectroliteGoal.inspect()).rejects.toThrow("another workspace");
});
