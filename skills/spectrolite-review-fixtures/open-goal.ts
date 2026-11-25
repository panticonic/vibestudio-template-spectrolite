import { vaultSourceReview, verifiesScopedVaultWrites } from "./source-content-evidence.js";
import {observedContentReview} from "@workspace/application-outcomes/observed-content-review";
import {assessObservedApplicationOutcome} from "@workspace/application-outcomes/observed-application-outcome";
import type {InvocationObservations} from "@workspace/application-outcomes/observed-invocation";
import type {SemanticOutcomeContract} from "@workspace/application-outcomes/semantic-outcome-contract";
import { isDeepStrictEqual } from "node:util";
import { panelTree, vcs } from "@workspace/runtime";
import { waitFor } from "@workspace/testkit";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { observeVaultReview, projectDocumentReviewReceipt } from "@workspace-panels/spectrolite/review-evidence";
const openSpectrolitePanel = "panels/spectrolite";
const openSpectroliteVault = "projects/default";

export type OpenSpectroliteScene = {
  id: string;
  goal: string;
  openPath: string;
  files: Record<string, string>;
  draft?: Record<string, string>;
  writablePath?: string;
  expected: {
    route: { from: string; target: string; to: string }[];
    path: string;
    findings: ["document" | "preview" | "navigation" | "revision", string][];
    visible?: string;
    editedSource?: string;
  };
};

type Inputs = { contextId: string; caseId: string; panelId: string };
type BrowserRead = {
  path: string;
  text: string;
  links: { target: string; title: string }[];
  preview: { phase: "pending" | "rendered" | "compile-error" | "render-error"; detail: string }[];
  reviewNotices: string[];
};
type Finding = { check: string; code: string; detail: string; evidenceIds: string[] };

const readEditor = `() => {
  const node = document.querySelector('[data-testid="spectrolite-editor"]');
  const path = node?.querySelector('[contenteditable="true"]')?.getAttribute('aria-label');
  if (!path) return null;
  return {
    path, text: node.innerText,
    links: Array.from(node.querySelectorAll('[data-wikilink]'), link => ({
      target: link.getAttribute('data-wikilink'), title: link.getAttribute('title')
    })),
    preview: Array.from(node.querySelectorAll('[data-spectrolite-preview]'), item => ({
      phase: item.getAttribute('data-spectrolite-preview'), detail: item.innerText
    })),
    reviewNotices: Array.from(document.querySelectorAll('[data-testid="spectrolite-suggestion-card"], [data-testid="spectrolite-document-unreadable"], [data-testid="spectrolite-save-error"]'),
      item => item.innerText)
  };
}`;
function renderedDocumentChanged(before: BrowserRead, after: BrowserRead): boolean {
  return before.text !== after.text ||
    !isDeepStrictEqual(before.links, after.links) ||
    !isDeepStrictEqual(before.preview, after.preview);
}

const stateRef = ({ kind, id }: { kind: "event" | "application"; id: string }) =>
  kind === "event" ? { kind, eventId: id } : { kind, applicationId: id };

export async function prepareOpenSpectroliteGoal(
  { contextId, caseId, panelId }: Inputs,
  world: OpenSpectroliteScene,
  { beforeWrite, writablePaths }: { beforeWrite?: (path: string) => Promise<void>; writablePaths?: readonly string[] } = {},
) {
  if (world.id !== caseId || !panelId) throw new Error("The Spectrolite goal needs its owned scene and editor");
  const { goal, expected } = world;
  const panel = panelTree.get(panelId);
  const initial = await vcs.status({ contextId });
  const hops: (typeof expected.route)[number][] = [];
  const writes: { path: string; from: string; toSourceHash: string }[] = [];
  async function ownedPanelIdentity() {
    const identity = await panel.observe();
    if (identity.kind !== "workspace" || identity.contextId !== contextId ||
        identity.requestedRef !== `ctx:${contextId}` || identity.source !== openSpectrolitePanel)
      throw new Error("Spectrolite panel belongs to another workspace");
    return identity;
  }

  async function observePanel(awaitedPath?: string) {
    await ownedPanelIdentity();
    return waitFor(async () => {
      const identity = await ownedPanelIdentity();
      const session = await panel.cdp.session();
      try {
        const read = await session.page.evaluate<BrowserRead | null>(`(${readEditor})()`);
        if (!read?.text.trim() || (awaitedPath && read.path !== awaitedPath) ||
            read.preview.some(({ phase }) => phase === "pending")) return undefined;
        const current = await ownedPanelIdentity();
        const binding = session.receipt;
        if (!binding || binding.generation.panelId !== panelId ||
            binding.generation.attemptId !== identity.attemptId || binding.generation.buildKey !== identity.buildKey ||
            current.attemptId !== identity.attemptId || current.buildKey !== identity.buildKey)
          throw new Error("The Spectrolite renderer changed while reading");
        return { read, binding };
      } finally {
        await session.close();
      }
    }, { label: "Read the owned Spectrolite document and its settled preview" });
  }

  async function observe(awaitedPath?: string) {
    const { read, binding } = await observePanel(awaitedPath);
    const { path } = read;
    const id = `${contextId}:${path}`;
    const { vault, document } = await observeVaultReview({
      contextId, repoPath: openSpectroliteVault, path,
      vaultReceiptId: `${id}:vault`, documentReceiptId: `${id}:document`,
    }, vcs);
    const working = stateRef(vault.working);
    const file = await vcs.readFile({ state: working, repositoryId: vault.repositoryId,
      file: { kind: "path", path } });
    if (!document || !file || file.content.kind !== "text" || document.fileId !== file.fileId)
      throw new Error("The open Spectrolite editor has no canonical text");
    const links = read.links.map(({ target, title }) => ({
      target, path: document.links.some(link => link.target === target && link.resolvedPath === title) ? title : null,
    }));
    const source = file.content.text;
    const revision = sha256HexSyncText(JSON.stringify({ read, source, working, generation: binding.generation }));
    return { view: { path, revision, source, visible: read.text, links }, read, binding, vault, document, working };
  }

  const inspections: Awaited<ReturnType<typeof observe>>[] = [];
  let busy = false;
  const revisionAttempts: { revision: string; outcome: string }[] = [];
  async function currentRevision(revision: string, intent: "navigate" | "edit") {
    const previous = inspections.at(-1);
    if (previous?.view.revision !== revision) return null;
    const current = await observe();
    if (intent === "navigate") return current.view.revision === revision ? current : null;
    const sameSource = current.view.path === previous.view.path &&
      current.document.fileId === previous.document.fileId && current.view.source === previous.view.source &&
      isDeepStrictEqual(current.working, previous.working) &&
      isDeepStrictEqual(current.binding.generation, previous.binding.generation);
    return sameSource ? current : null;
  }
  async function evidence(checks: string[]) {
    const observed = await observe();
    const { view, read, vault, document } = observed;
    const committed = stateRef(vault.committed);
    const committedDocument = checks.includes("revision") ? projectDocumentReviewReceipt(
      `${contextId}:${view.path}:committed`, committed,
      await vcs.readFile({ state: committed, repositoryId: vault.repositoryId,
        file: { kind: "path", path: view.path } }), [],
    ) : null;
    const currentPreview = read.preview.find(({ phase }) => phase !== "rendered") ?? read.preview[0];
    return { goal, path: view.path, checks, vault, document, committedDocument,
      navigation: hops.length ? { id: `${contextId}:navigation`, hops: structuredClone(hops) } : null,
      preview: currentPreview ? {
        id: `${contextId}:${view.path}:preview`, documentPath: view.path,
        contentHash: document.contentHash, phase: currentPreview.phase, detail: currentPreview.detail,
      } : null,
      scribeTarget: null, handoff: null, publication: null };
  }

  const services = {
    spectroliteGoal: {
      async inspect() {
        const observed = await observe();
        inspections.push(observed);
        return observed.view;
      },
      async follow(target: string, revision: string) {
        if (busy) return "changed";
        busy = true;
        try {
          const current = await currentRevision(revision, "navigate");
          if (!current) return "changed";
          const link = current.view.links.find(item => item.target === target);
          if (!link?.path) return "unavailable";
          const session = await panel.cdp.session();
          try {
            const binding = session.receipt;
            if (!binding || !isDeepStrictEqual(binding.generation, current.binding.generation)) return "changed";
            const clicked = await session.page.evaluate<boolean>(`(() => {
              const live = (${readEditor})();
              if (JSON.stringify(live) !== ${JSON.stringify(JSON.stringify(current.read))}) return false;
              const link = Array.from(document.querySelectorAll('[data-testid="spectrolite-editor"] [data-wikilink]'))
                .find(node => node.getAttribute('data-wikilink') === ${JSON.stringify(target)} &&
                  node.getAttribute('title') === ${JSON.stringify(link.path)});
              if (!(link instanceof HTMLElement)) return false;
              link.click();
              return true;
            })()`);
            if (!clicked) return "changed";
          } finally {
            await session.close();
          }
          const destination = await observe(link.path);
          if (!isDeepStrictEqual(destination.binding.generation, current.binding.generation))
            throw new Error("The Spectrolite renderer changed during navigation");
          hops.push({ from: current.view.path, target, to: destination.view.path });
          return "followed";
        } finally {
          busy = false;
        }
      },
      async revise(revision: string, source: string) {
        if (busy) return "changed";
        busy = true;
        try {
          const current = await currentRevision(revision, "edit");
          if (!current) {
            revisionAttempts.push({ revision, outcome: "changed" });
            return "changed";
          }
          const { view, vault, document, working } = current;
          const authorized = writablePaths ? writablePaths.includes(view.path) : view.path === world.writablePath;
          if (!authorized || typeof source !== "string" || source === view.source ||
              source.length > 16_000) return "unavailable";
          await beforeWrite?.(view.path);
          let edited;
          try {
            edited = await vcs.edit({
              contextId, expectedWorkingHead: working, commandId: `open-spectrolite:write:${crypto.randomUUID()}`,
              changes: [{ kind: "text-edit", repositoryId: vault.repositoryId, fileId: document.fileId,
                edits: [{ start: 0, end: view.source.length, text: source }] }],
            });
          } catch (error) {
            if (!isDeepStrictEqual((await vcs.status({ contextId })).workingHead, working)) {
              revisionAttempts.push({ revision, outcome: "changed" });
              return "changed";
            }
            throw error;
          }
          const saved = await vcs.readFile({ state: edited.workingHead, repositoryId: vault.repositoryId,
            file: { kind: "path", path: view.path } });
          if (!edited.changeIds.length || saved?.content.kind !== "text" || saved.content.text !== source)
            throw new Error("Spectrolite semantic edit did not retain the proposed source");
          writes.push({ path: view.path, from: revision, toSourceHash: sha256HexSyncText(source) });
          let last = current;
          try {
            await waitFor(async () => {
              last = await observe(view.path);
              return last.view.source === source && renderedDocumentChanged(current.read, last.read) ? true : undefined;
            }, { label: "Read the saved change from the Spectrolite editor" });
          } catch (error) {
            throw new Error(
              `Spectrolite could not read the saved change in the editor: ${JSON.stringify({
                persisted: last.view.source === source, visibleChange: renderedDocumentChanged(current.read, last.read),
                before: current.working, after: last.working, notices: last.read.reviewNotices,
              })}`,
              { cause: error },
            );
          }
          revisionAttempts.push({ revision, outcome: "written" });
          return "written";
        } finally {
          busy = false;
        }
      },
      async evidence(checks: string[]) {
        if (!checks.length || new Set(checks).size !== checks.length ||
            checks.some(check => !["document", "preview", "navigation", "revision"].includes(check)))
          throw new Error("Choose actual Spectrolite document, preview, navigation, or revision checks");
        return evidence(checks);
      },
    },
  };

  async function verify(value: unknown,invocation?:InvocationObservations) {
    const report = (value as unknown | null);
    const outcome = report as { status?: string; path?: string; revision?: string; review?: { findings: Finding[] } };
    const { final, status, committedFiles, workingFiles, sourceContentEvidence } = await inspectNativeState();
    const expectedWorking = { ...world.files, ...world.draft };
    const editablePaths = world.writablePath ? [world.writablePath] : [];
    const observations = inspections.map(({ read, view, binding, document }) => ({ path: view.path, revision: view.revision, visible: read.text, source:view.source, preview:read.preview, document, binding }));
    const findings = outcome?.review?.findings;
    // Independently observe current facts; a particular actor evidence-call route is not required.
    const receipts = await evidence(["document", "preview", "navigation", "revision"]);
    function relevantIds(check: string) {
      return receipts ? [receipts.vault.id, receipts.document.id,
        check === "preview" ? receipts.preview?.id : check === "navigation" ? receipts.navigation?.id :
          check === "revision" ? receipts.committedDocument?.id : null,
      ].filter(Boolean) : [];
    }
    const checks = {
      originalSpectroliteEditor: observations[0]?.path === world.openPath && observations.every(({ binding }) =>
        isDeepStrictEqual(binding.generation, final.binding.generation)),
      exactObservedNavigation: expected.route.every(edge => hops.some(hop => isDeepStrictEqual(hop, edge))) &&
        expected.route.every(({ to }) => observations.some(({ path }) => path === to)),
      currentSpectroliteOutcome: final.view.path === expected.path &&
        observations.at(-1)?.revision === final.view.revision &&
        (editablePaths.length > 0 || !expected.visible || final.read.text.includes(expected.visible)),
      canonicalReviewFindings: Array.isArray(findings) &&
        receipts.path === expected.path && receipts.document.contentHash === final.document.contentHash &&
        findings.every(row => {
          if (!row || !["document","preview","navigation","revision"].includes(row.check)) return false;
          return row.code === classifyFinding(receipts,row.check) &&
            typeof row.detail === "string" && row.detail.trim().length > 0 &&
            Array.isArray(row.evidenceIds) && row.evidenceIds.every(id => relevantIds(row.check).includes(id));
        }),
      exactVaultWrite: editablePaths.length > 0
        ? !!sourceContentEvidence && verifiesScopedVaultWrites(sourceContentEvidence, editablePaths)
        : isDeepStrictEqual(workingFiles, expectedWorking) && writes.length === 0 &&
          isDeepStrictEqual(status.workingHead, initial.workingHead),
      protectedVaultHeads: isDeepStrictEqual(initial.committed, status.committed) &&
        initial.mainEventId === status.mainEventId && isDeepStrictEqual(committedFiles, world.files),
    };
    const contract:SemanticOutcomeContract={effects:{checks:["originalSpectroliteEditor", "exactObservedNavigation", "exactVaultWrite", "protectedVaultHeads"],rationale:"Independent native observations, authority and persisted state establish application effects."},returnedValue:{checks:["currentSpectroliteOutcome", "canonicalReviewFindings"],required:editablePaths.length===0,rationale:"These are the actual requested domain findings or query values; mutation-only calls retain their separately observed effects."},incidentalValues:{checks:[],rationale:"Optional incorrect mutation returns are recorded against the actual invocation, without invalidating correct native effects."}};

    const assessed=await assessObservedApplicationOutcome({ passed: Object.values(checks).every(Boolean), contextId, caseId, panelId, goal, checks,
      observations, hops, receipts, writes, revisionAttempts, final: { path: final.view.path, revision: final.view.revision, binding: final.binding },
      committedFiles, workingFiles,
      ...(editablePaths.length && sourceContentEvidence ? vaultSourceReview(goal, editablePaths, sourceContentEvidence) : {}),
    },contract,value,invocation,[
    {checks:["canonicalReviewFindings"],rootPath:["review"],producerSourceSuffix:"workTowardVaultGoal/reviewCurrentVault.nl"},
    {checks:["currentSpectroliteOutcome"],rootPath:["reason"],producerSourceSuffix:"workTowardVaultGoal/chooseVaultStep.nl",producerPath:["reason"]},
  ]);
    const {observedChecks,...dimensions}=assessed;
    return {...dimensions,checks:observedChecks,
      ...(!editablePaths.length ? observedContentReview(assessed,contract,value,["observations","hops","receipts","final"]) : {}),
    };
  }

  function classifyFinding(data: Awaited<ReturnType<typeof evidence>>, check: string) {
    if (check === "document") return data.document.links.some(link => !link.resolvedPath)
      ? "broken-link" : "document-ready";
    if (check === "preview") return data.preview?.phase === "rendered" ? "preview-ready"
      : data.preview?.phase === "compile-error" || data.preview?.phase === "render-error"
        ? data.preview.phase : "preview-missing";
    if (check === "revision") return !data.committedDocument ? "revision-unverified"
      : data.committedDocument.contentHash === data.document.contentHash ? "revision-unchanged" : "draft-changed";
    if (check === "navigation") return data.navigation?.hops.at(-1)?.to === data.path
      ? "navigation-ready" : "navigation-missing";
    throw new Error("Unsupported Spectrolite finding");
  }

  async function reference() {
    let current = await services.spectroliteGoal.inspect();
    const observedTarget = current.links.find(({ path }) => path)?.target ?? "no-observed-target";
    const rejectsStaleView = await services.spectroliteGoal.follow(observedTarget, "prior-editor-revision") === "changed";
    const rejectsLinkAlias = await services.spectroliteGoal.follow(`./${observedTarget}`, current.revision) === "unavailable";
    for (const { target } of expected.route) {
      if (await services.spectroliteGoal.follow(target, current.revision) !== "followed")
        throw new Error("The reference route could not follow the observed wiki-link");
      current = await services.spectroliteGoal.inspect();
    }
    if (expected.editedSource !== undefined) {
      let revision = await services.spectroliteGoal.revise(current.revision, expected.editedSource);
      if (revision === "changed") {
        current = await services.spectroliteGoal.inspect();
        revision = await services.spectroliteGoal.revise(current.revision, expected.editedSource);
      }
      if (revision !== "written") throw new Error(`The reference draft could not be persisted (${revision})`);
      current = await services.spectroliteGoal.inspect();
    }
    const data = await services.spectroliteGoal.evidence(expected.findings.map(([check]) => check));
    const findings = expected.findings.map(([check]) => {
      const code = classifyFinding(data, check);
      return ({
      check, code,
      detail: check === "navigation" ? [world.openPath, ...hops.map(({ to }) => to)].join(" → ") :
        code === "broken-link" ? data.document.links.filter(link => !link.resolvedPath).map(({ target }) => target).join(", ") : code,
      evidenceIds: [data.vault.id, data.document.id, check === "preview" ? data.preview?.id :
        check === "navigation" ? data.navigation?.id : check === "revision" ? data.committedDocument?.id : null].filter(Boolean),
      });
    });
    const outcome = {
      status: expected.editedSource === undefined ? "reviewed" : "edited",
      path: current.path, revision: current.revision, review: { findings },
    };
    const verified = await verify(outcome);
    const checks = { ...verified.checks, rejectsStaleView, rejectsLinkAlias };
    return { outcome, verification: { ...verified, checks, passed: Object.values(checks).every(Boolean) } };
  }
  async function inspectNativeState() {
    const final = await observe();
    const status = await vcs.status({ contextId });
    const readFiles = async (state: typeof final.working) => Object.fromEntries(
      await Promise.all(Object.keys(world.files).map(async path => {
        const file = await vcs.readFile({ state, repositoryId: final.vault.repositoryId, file: { kind: "path", path } });
        return [path, file?.content.kind === "text" ? file.content.text : null];
      })),
    );
    const [committedFiles, workingFiles, originalDocuments] = await Promise.all([
      readFiles(stateRef(final.vault.committed)), readFiles(final.working),
      world.writablePath || writablePaths?.length ? readFiles(initial.workingHead) : undefined,
    ]);
    const observedDocuments = [...new Map(inspections.map(({view, read, binding}) => {
      const sourceHash = sha256HexSyncText(view.source);
      return [JSON.stringify([view.path,view.revision,sourceHash]), {path:view.path,revision:view.revision,source:view.source,sourceHash,visible:view.visible,preview:read.preview,binding}] as const;
    })).values()];
    return {
      final, status, initial, committedFiles, workingFiles,
      ...(originalDocuments ? { sourceContentEvidence: {
        originalDocuments, observedDocuments, retainedDocuments:workingFiles, committedDocuments:committedFiles,
        currentDocument:{path:final.view.path,revision:final.view.revision,source:final.view.source,sourceHash:sha256HexSyncText(final.view.source),visible:final.read.text,preview:final.read.preview,binding:final.binding},
        writes:structuredClone(writes),navigationHops:structuredClone(hops),
      }} : {sourceContentEvidence:undefined}),
      hops: structuredClone(hops), writes: structuredClone(writes),
      revisionAttempts: structuredClone(revisionAttempts),
    };
  }
  return { goal, services, verify, reference, inspectLive: observe, inspectNativeState, qualify: async () => (await reference()).verification };
}
