import { beforeEach, expect, it, vi } from "vitest";
import { prepareOpenSpectroliteGoal, type OpenSpectroliteScene } from "./open-goal.js";
import { prepareVaultKnowledge } from "./knowledge-managed.js";

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
  replaceDuringRead: false,
  closedAttempts: [] as string[],
}));
const ref = { kind: "event", eventId: "commit" };
vi.mock("@workspace/testkit", () => ({
  waitFor: async (fn: () => Promise<unknown>) => {
    let failure: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const value = await fn();
        if (value !== undefined) return value;
      } catch (error) {
        failure = error;
      }
    }
    throw failure ?? new Error("No stable observation");
  },
}));
vi.mock("@workspace/runtime", () => ({
  fs: {},
  vcs: {
    status: async () => ({ mainEventId: "main", workingHead: ref, committed: ref }),
    edit: async ({ changes }: { changes: { fileId: string; edits: { text: string }[] }[] }) => {
      for (const change of changes) state.source[change.fileId] = change.edits[0]!.text;
      return { workingHead: ref, changeIds: ["edit"] };
    },
    readFile: async ({ file }: { file: { path: string } }) => ({
      fileId: file.path, content: { kind: "text", text: state.source[file.path] },
    }),
  },
  panelTree: { get: () => ({
    observe: async () => ({ ...state.generation, kind: "workspace", contextId: state.contextId,
      requestedRef: "ctx:context", source: "panels/spectrolite" }),
    cdp: { session: async () => {
      const generation = state.generation;
      return {
        receipt: { generation },
        close: async () => { state.closedAttempts.push(generation.attemptId); },
        page: { evaluate: async (expression: string) => {
          if (state.replaceDuringRead) {
            state.replaceDuringRead = false;
            state.generation = { ...generation, attemptId: "replacement" };
            return { path: state.path, text: "stale renderer text", preview: [], links: [] };
          }
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
      };
    } },
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

beforeEach(() => {
  state.actions = [];
  state.contextId = "context";
  state.generation = { ...state.generation, attemptId: "attempt" };
  state.replaceDuringRead = false;
  state.closedAttempts = [];
});
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
  expect((await prepared.verify({
    status: "reviewed", path: view.path, revision: view.revision,
    review: { findings: [{ check: "document", code: "document-ready", detail: "All links resolved", evidenceIds: ["vault", "doc"] }] },
  })).checks.canonicalReviewFindings).toBe(false);
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


it("discards a renderer observation when its generation changes during the read", async () => {
  const prepared = await useWorld(unresolved);
  state.replaceDuringRead = true;
  const view = await prepared.services.spectroliteGoal.inspect();
  expect(view.path).toBe(unresolved.openPath);
  expect(view.links.map(link => link.target)).toEqual(["Withdrawn Collections Ruling"]);
  expect(state.closedAttempts).toEqual(["attempt", "replacement"]);
});


it("fails incomplete vault knowledge results while independently checking native state", async () => {
  state.path = unresolved.openPath;
  state.source = { ...unresolved.files };
  const prepared = await prepareVaultKnowledge({ contextId: "context", caseId: unresolved.id, panelId: "panel" }, {
    ...unresolved,
    kind: "vaultWork",
    workspace: "spectrolite",
    sourceGroup: "incomplete-result",
    expected: {
      steps: [{ kind: "read", path: unresolved.openPath, findings: [["document", "broken-link"]] }],
      path: unresolved.openPath, outcome: "retired-link", citations: ["Withdrawn Collections Ruling"],
    },
  });
  const proof = await prepared.verify({});
  expect(proof.passed).toBe(false);
  expect(proof.checks).toMatchObject({ joinedNativeKnowledge: false, independentVaultReadback: true });
});

it("accepts exploratory navigation while requiring the selected link and final native state", async () => {
  const world = { ...alias, files: { ...alias.files,
    "records/Accession Intake.mdx": "Plain instructions. Return to [[Archive Index]]." } };
  const prepared = await useWorld(world);
  const { spectroliteGoal } = prepared.services;
  const start = await spectroliteGoal.inspect();
  expect(await spectroliteGoal.follow("Accession Intake", start.revision)).toBe("followed");
  const target = await spectroliteGoal.inspect();
  expect(await spectroliteGoal.follow("Archive Index", target.revision)).toBe("followed");
  expect((await prepared.qualify()).passed).toBe(true);
  expect(state.actions).toEqual(["records/Accession Intake.mdx", "Archive Index.mdx", "records/Accession Intake.mdx"]);
});

it("supports revising an authorized document iteratively with fresh native evidence", async () => {
  const prepared = await useWorld({ ...unresolved, writablePath: unresolved.openPath });
  const { spectroliteGoal } = prepared.services;
  const before = await spectroliteGoal.inspect();
  expect(await spectroliteGoal.revise(before.revision, "Intermediate revision.")).toBe("written");
  expect(await spectroliteGoal.revise(before.revision, "Stale overwrite.")).toBe("changed");
  const after = await spectroliteGoal.inspect();
  expect(await spectroliteGoal.revise(after.revision, "Final revision.")).toBe("written");
  expect(state.source[unresolved.openPath]).toBe("Final revision.");
});
