import { beforeEach, expect, it, vi } from "vitest";
import {sha256HexSyncText} from "@vibestudio/content-addressing";
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
  head: "commit",
  history: new Map<string, Record<string,string>>(),
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
    status: async () => ({ mainEventId: "main", workingHead: {kind:"event",eventId:state.head}, committed: ref }),
    edit: async ({ changes }: { changes: { fileId: string; edits: { text: string }[] }[] }) => {
      state.history.set(state.head, {...state.source});
      for (const change of changes) state.source[change.fileId] = change.edits[0]!.text;
      state.head = `edit-${state.history.size}`;
      return { workingHead: {kind:"event",eventId:state.head}, changeIds: ["edit"] };
    },
    readFile: async ({ state: ref, file }: { state: {eventId:string}; file: { path: string } }) => ({
      fileId: file.path, content: { kind: "text", text: (state.history.get(ref.eventId) ?? state.source)[file.path] },
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
    vault: { id: "vault", repositoryId: "repo", working: { kind: "event", id: state.head },
      committed: { kind: "event", id: "commit" } },
    document: { id: "doc", fileId: path, links: links(path), contentHash: sha256HexSyncText(state.source[path] ?? "") },
  }),
  projectDocumentReviewReceipt: () => null,
}));

beforeEach(() => {
  state.actions = [];
  state.head = "commit";
  state.history.clear();
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

it("binds alternative vault prose to actual native bytes and preserves protected files", async () => {
  const target="Public Notice.mdx",authority="Signed Order.mdx",protectedPath="Crew Note.mdx";
  const world:OpenSpectroliteScene={id:"alternative-prose",goal:"Update the public gate closing time from the signed order. Preserve unrelated copy and leave a working draft.",openPath:target,
    files:{[target]:"Gate closes at 18:00.",[authority]:"Approved closing time: 18:45.",[protectedPath]:"Keep the emergency lane clear."},
    writablePath:target,expected:{path:target,route:[],findings:[],visible:"Gate closes at 18:45.",editedSource:"Gate closes at 18:45."}};
  const prepared=await useWorld(world);
  const service=prepared.services.spectroliteGoal;
  const original=await service.inspect();
  const candidate="The public gate closing time is 18:45.";
  expect(await service.revise(original.revision,candidate)).toBe("written");
  const proof=await prepared.verify(null);
  expect(proof.outcomeDimensions.effects.passed).toBe(true);
  expect(proof.semanticReviewRequired).toBe(true);
  expect(proof.sourceContentEvidence?.originalDocuments[target]).toBe(world.files[target]);
  expect(proof.sourceContentEvidence?.retainedDocuments[target]).toBe(candidate);
  expect(proof.sourceContentEvidence?.originalDocuments).toEqual(world.files);
  expect(proof.sourceContentEvidence?.committedDocuments).toEqual(world.files);
  expect(proof.sourceContentEvidence?.currentDocument.sourceHash).toBe(sha256HexSyncText(candidate));
  expect(proof.sourceContentEvidence?.writes.at(-1)?.toSourceHash).toBe(sha256HexSyncText(candidate));
  expect(proof.sourceContentEvidence?.observedDocuments).toEqual(expect.arrayContaining([expect.objectContaining({path:target,source:world.files[target],sourceHash:sha256HexSyncText(world.files[target]!)} )]));
  expect(proof.semanticReviewInput?.actual).toEqual({goal:world.goal,...proof.sourceContentEvidence});
  expect(JSON.stringify(proof.semanticReviewInput)).not.toContain(world.expected.editedSource);
  state.source[protectedPath]="Unauthorized change.";
  expect((await prepared.verify(null)).outcomeDimensions.effects.passed).toBe(false);
  state.source[protectedPath]=world.files[protectedPath]!;
  state.source[target]="Unrecorded later replacement.";
  expect((await prepared.verify(null)).outcomeDimensions.effects.passed).toBe(false);
});

it("verifies knowledge writes against retained candidate bytes rather than reference prose", async () => {
  const target="Notice.mdx",protectedPath="Crew.mdx";
  const files={[target]:"Gate closes at 18:00.",[protectedPath]:"Crew briefing remains at 17:00."};
  state.path=target;state.source={...files};
  const prepared=await prepareVaultKnowledge({contextId:"context",caseId:"knowledge-alternate",panelId:"panel"},{
    kind:"vaultWork",workspace:"spectrolite",id:"knowledge-alternate",goal:"Rewrite the notice to say the gate closes at 18:45, leaving the crew briefing alone.",sourceGroup:"knowledge-alternate",openPath:target,files,writable:[target],
    expected:{path:target,outcome:"edited",citations:[],steps:[{kind:"read",path:target,findings:[["document","document-ready"]]},{kind:"write",path:target,source:"Gate closes at 18:45."},{kind:"read",path:target,findings:[["document","document-ready"]]}]}
  });
  const service=prepared.services.spectroliteGoal;
  const before=await service.inspect();await service.evidence(["document"]);
  const actual="The closing time for the gate is 18:45.";
  expect(await service.revise(before.revision,actual)).toBe("written");
  await service.inspect();await service.evidence(["document"]);
  const proof=await prepared.verify(null);
  expect(proof.outcomeDimensions.effects.passed).toBe(true);
  expect(proof.semanticReviewRequired).toBe(true);
  expect(proof.semanticReviewInput?.actual).toEqual({goal:proof.goal,...proof.sourceContentEvidence});
  expect(proof.sourceContentEvidence?.retainedDocuments[target]).toBe(actual);
  state.source[protectedPath]="Unauthorized change.";
  expect((await prepared.verify(null)).outcomeDimensions.effects.passed).toBe(false);
});
