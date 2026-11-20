import { isDeepStrictEqual } from "node:util";
import { fs, vcs } from "@workspace/runtime";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import type {
  OpenVaultView,
  ReviewCheck,
  SpectroliteReviewRequest,
  VaultHandoffEvidence,
  VaultHandoffPlan,
  VaultKnowledgeHandoff,
  VaultKnowledgeOutcome,
  VaultKnowledgeRead,
  VaultKnowledgeReport,
} from "../spectrolite-review/types.js";
import { prepareOpenSpectroliteGoal } from "./open-goal.js";
import {
  verifiesKnowledgeGraph,
  type KnowledgeGraphExpectation,
} from "./knowledge-graph.js";

type Check = "document" | "preview" | "revision";
type Step =
  | { kind: "read"; path: string; findings: [Check, string][] }
  | { kind: "follow"; from: string; target: string; to: string }
  | { kind: "write"; path: string; source: string };
export type VaultKnowledgeWorld = {
  kind: "vaultWork";
  workspace: "spectrolite";
  id: string;
  goal: string;
  sourceGroup: string;
  split?: "test";
  openPath: string;
  files: Record<string, string>;
  draft?: Record<string, string | null>;
  writable?: string[];
  movement?: { path: string; addition: string };
  handoff?: { path: string; audience: string };
  expected: {
    steps: Step[];
    path: string;
    outcome: VaultKnowledgeOutcome;
    citations: string[];
    disposition?: VaultHandoffPlan["disposition"];
    graph?: KnowledgeGraphExpectation;
  };
};
type Input = { contextId: string; caseId: string; panelId: string };
const codes = (receipt: SpectroliteReviewRequest, check: ReviewCheck) => {
  switch (check) {
    case "document":
      return receipt.document?.links.some((link) => !link.resolvedPath)
        ? "broken-link"
        : "document-ready";
    case "preview":
      return receipt.preview?.phase === "rendered"
        ? "preview-ready"
        : (receipt.preview?.phase ?? "preview-missing");
    case "revision":
      return !receipt.committedDocument
        ? "revision-unverified"
        : receipt.committedDocument.contentHash ===
            receipt.document?.contentHash
          ? "revision-unchanged"
          : "draft-changed";
    default:
      throw new Error("Unsupported knowledge review boundary");
  }
};
const ids = (
  { vault, document, preview, committedDocument }: SpectroliteReviewRequest,
  check: ReviewCheck,
) =>
  [
    vault.id,
    document?.id,
    check === "revision"
      ? committedDocument?.id
      : check === "preview"
        ? preview?.id
        : null,
  ].filter((id): id is string => Boolean(id));

export async function prepareVaultKnowledge(
  input: Input,
  world: VaultKnowledgeWorld,
) {
  let moved = false;
  async function beforeWrite(path: string) {
    if (!world.movement || moved || world.movement.path !== path) return;
    const { workingHead } = await vcs.status({ contextId: input.contextId });
    const repository = await vcs.resolveRepository({
      state: workingHead,
      repoPath: "projects/default",
    });
    if (!repository)
      throw new Error("The owned concurrent writer lost its vault");
    const { repositoryId } = repository;
    const file = await vcs.readFile({
      state: workingHead,
      repositoryId,
      file: { kind: "path", path },
    });
    if (file?.content.kind !== "text")
      throw new Error("The owned concurrent writer lost its source");
    const end = file.content.text.length;
    const result = await vcs.edit({
      contextId: input.contextId,
      expectedWorkingHead: workingHead,
      commandId: `vault-knowledge:owner:${crypto.randomUUID()}`,
      changes: [
        {
          kind: "text-edit",
          repositoryId,
          fileId: file.fileId,
          edits: [{ start: end, end, text: world.movement.addition }],
        },
      ],
    });
    if (!result.changeIds.length)
      throw new Error("The concurrent edit did not move the exact source");
    moved = true;
  }
  const core = await prepareOpenSpectroliteGoal(
    input,
    {
      id: world.id,
      goal: world.goal,
      openPath: world.openPath,
      files: world.files,
      expected: { route: [], path: world.openPath, findings: [] },
    },
    {
      beforeWrite,
      writablePaths: world.writable ?? [],
    },
  );
  const underlying = core.services.spectroliteGoal;
  const directory = world.handoff
    ? await fs.mkdtemp("vault-knowledge-handoff")
    : null;
  const file = directory ? directory + "/review.json" : null;
  const journal: {
    service: string;
    method: string;
    args: unknown[];
    result: unknown;
  }[] = [];
  const events: Step[] = [];
  const views: OpenVaultView[] = [];
  const receipts: {
    view: OpenVaultView;
    evidence: SpectroliteReviewRequest;
  }[] = [];
  let handoffBasis:
    | { view: OpenVaultView; evidence: VaultHandoffEvidence }
    | undefined;
  let saved: VaultKnowledgeHandoff | null = null;
  let handoffAttempt: { audience: string; plan: VaultHandoffPlan } | undefined;
  let staging = false;
  let handoffAt: number | undefined;

  function record<T>(
    service: string,
    method: string,
    args: unknown[],
    result: T,
  ) {
    journal.push(structuredClone({ service, method, args, result }));
    return result;
  }
  const goal = <T>(method: string, args: unknown[], result: T) =>
    record("spectroliteGoal", method, args, result);
  const services = {
    spectroliteGoal: {
      async inspect() {
        const view = await underlying.inspect();
        views.push(structuredClone(view));
        return goal("inspect", [], view);
      },
      async follow(target: string, revision: string) {
        const from = views.at(-1);
        const result = await underlying.follow(target, revision);
        if (result === "followed" && from) {
          const to = from.links.find((row) => row.target === target)?.path;
          if (!to)
            throw new Error(
              "The actual followed link matched no current destination",
            );
          events.push({ kind: "follow", from: from.path, target, to });
        }
        return goal("follow", [target, revision], result);
      },
      async revise(revision: string, source: string) {
        const result = await underlying.revise(revision, source);
        if (result === "written")
          events.push({ kind: "write", path: views.at(-1)!.path, source });
        return goal("revise", [revision, source], result);
      },
      async evidence(checks: Check[]) {
        if (
          checks.some(
            (check) => !["document", "preview", "revision"].includes(check),
          )
        )
          throw new Error(
            "Read only document, preview or revision evidence in this vault",
          );
        const view = views.at(-1);
        const evidence = (await underlying.evidence(
          checks,
        )) as SpectroliteReviewRequest;
        if (
          !view ||
          evidence.path !== view.path ||
          !evidence.document ||
          evidence.document.contentHash !== sha256HexSyncText(view.source)
        )
          throw new Error(
            "The current review receipt differs from its observation",
          );
        const native = await core.inspectLive();
        if (native.view.revision !== view.revision)
          throw new Error(
            "The renderer or source changed before the vault receipt",
          );
        receipts.push({
          view: structuredClone(view),
          evidence: structuredClone(evidence),
        });
        events.push({
          kind: "read",
          path: view.path,
          findings: checks.map((check) => [check, codes(evidence, check)]),
        });
        return goal("evidence", [checks], evidence);
      },
    },
    spectroliteHandoffRead: {
      async evidence() {
        const view = views.at(-1);
        if (!view || view.path !== world.handoff?.path)
          throw new Error("The current note cannot be used for this handoff");
        const { vault, document, committedDocument, preview } =
          (await underlying.evidence([
            "document",
            "preview",
            "revision",
          ])) as SpectroliteReviewRequest;
        if (
          !document ||
          document.contentHash !== sha256HexSyncText(view.source)
        )
          throw new Error("The current note moved before handoff");
        const evidence = {
          vault,
          document,
          committedDocument: committedDocument ?? null,
          preview,
        };
        handoffBasis = structuredClone({ view, evidence });
        return record("spectroliteHandoffRead", "evidence", [], evidence);
      },
    },
    vaultKnowledgeHandoff: {
      async stage(revision: string, audience: string, plan: VaultHandoffPlan) {
        const done = (result: VaultKnowledgeHandoff | null) =>
          record(
            "vaultKnowledgeHandoff",
            "stage",
            [revision, audience, plan],
            result,
          );
        if (
          !file ||
          !handoffBasis ||
          !world.handoff ||
          staging ||
          handoffAttempt ||
          handoffBasis.view.revision !== revision ||
          audience !== world.handoff.audience
        )
          return done(null);
        staging = true;
        try {
          const live = (await core.inspectLive()).view;
          if (live.revision !== revision || live.path !== world.handoff.path)
            return done(null);
          const exact = planFor(handoffBasis.evidence);
          if (!isDeepStrictEqual(plan, exact)) return done(null);
          handoffAttempt = { audience, plan };
          handoffAt = events.length;
          if (plan.disposition === "hold") return done(null);
          const receipt = {
            audience,
            path: live.path,
            revision,
            plan,
            receipt: crypto.randomUUID(),
          };
          await fs.writeFile(file, JSON.stringify(receipt));
          saved = JSON.parse(await fs.readFile(file, "utf8"));
          return done(isDeepStrictEqual(saved, receipt) ? saved : null);
        } finally {
          staging = false;
        }
      },
    },
  };

  function planFor(data: VaultHandoffEvidence): VaultHandoffPlan {
    const { vault, document, committedDocument, preview } = data;
    const basis = [vault.id, document.id];
    const previewMatches =
      preview?.phase === "rendered" &&
      preview.documentPath === document.path &&
      preview.contentHash === document.contentHash;
    const committedMatches =
      committedDocument?.path === document.path &&
      committedDocument?.repositoryId === vault.repositoryId &&
      isDeepStrictEqual(committedDocument.ref, vault.committed);
    if (
      !previewMatches ||
      !committedMatches ||
      !isDeepStrictEqual(document.ref, vault.working)
    ) {
      return {
        disposition: "hold",
        ref: null,
        contentHash: null,
        evidenceIds: [...basis, ...(preview ? [preview.id] : [])],
      };
    }
    return {
      disposition:
        vault.clean && committedDocument.contentHash === document.contentHash
          ? "committed-review"
          : "draft-only",
      ref: document.ref,
      contentHash: document.contentHash,
      evidenceIds: [...basis, committedDocument.id, preview.id],
    };
  }

  async function verify(value: unknown) {
    const wrapper = value as {
      status?: string;
      skill?: string;
      outcome?: VaultKnowledgeReport;
    } | null;
    const report =
      wrapper?.status === "workspace-skill-reviewed" &&
      wrapper.skill === world.kind
        ? wrapper.outcome
        : undefined;
    const {
      final,
      status,
      initial,
      hops,
      writes,
      workingFiles,
      committedFiles,
      revisionAttempts,
    } = await core.inspectNativeState();
    const expectation = world.expected;
    const expectedWorking = { ...world.files, ...world.draft };
    const paths = expectation.steps.filter((step) => step.kind === "write");
    for (const step of paths) expectedWorking[step.path] = step.source;
    const readSteps = (expectation.graph ? events : expectation.steps).filter(
      (step) => step.kind === "read",
    );
    const persisted =
      file && saved ? JSON.parse(await fs.readFile(file, "utf8")) : null;
    const authorityPath =
      expectation.outcome === "authority-confirmed"
        ? (expectation.graph?.authorityPath ?? expectation.path)
        : null;
    const noHandOffFile =
      !directory || !(await fs.readdir(directory)).includes("review.json");
    const checks = {
      exactVaultRoute:
        (expectation.graph
          ? verifiesKnowledgeGraph(
              expectation.graph,
              expectation.steps,
              events,
              handoffAt,
            )
          : isDeepStrictEqual(events, expectation.steps)) &&
        views[0]?.path === world.openPath &&
        views.at(-1)?.revision === final.view.revision &&
        final.view.path === expectation.path &&
        report?.path === final.view.path &&
        report.revision === final.view.revision,
      joinedNativeKnowledge:
        report?.reads.length === readSteps.length &&
        receipts.length === readSteps.length &&
        receipts.every(({ view, evidence }, index) => {
          const row = report.reads[index];
          return (
            row &&
            isDeepStrictEqual(row.view, view) &&
            row.review.findings.length === readSteps[index]?.findings.length &&
            readSteps[index].findings.every(([check, code], offset) => {
              const finding = row.review.findings[offset];
              return (
                finding?.check === check &&
                finding.code === code &&
                finding.code === codes(evidence, check) &&
                isDeepStrictEqual(finding.evidenceIds, ids(evidence, check)) &&
                Boolean(finding.detail?.trim()) &&
                (!(code === "compile-error" || code === "render-error") ||
                  Boolean(
                    evidence.preview?.detail &&
                    finding.detail.includes(evidence.preview.detail),
                  ))
              );
            })
          );
        }),
      independentVaultReadback:
        isDeepStrictEqual(workingFiles, expectedWorking) &&
        isDeepStrictEqual(committedFiles, world.files) &&
        writes.length === paths.length &&
        paths.every((step, i) => {
          const write = expectation.graph
            ? writes.find((value) => value.path === step.path)
            : writes[i];
          return (
            write?.path === step.path &&
            write.toSourceHash === sha256HexSyncText(step.source)
          );
        }),
      preservedCommittedVault:
        isDeepStrictEqual(status.committed, initial.committed) &&
        status.mainEventId === initial.mainEventId &&
        (paths.length > 0 ||
          isDeepStrictEqual(status.workingHead, initial.workingHead)),
      recoveredRevisedSource: world.movement
        ? moved &&
          revisionAttempts.some((row) => row.outcome === "changed") &&
          workingFiles[world.movement.path]?.includes(
            world.movement.addition,
          ) === true
        : !moved,
      matchedKnowledgeOutcome:
        report?.outcome === expectation.outcome &&
        report.authorityPath === authorityPath &&
        typeof report.answer === "string" &&
        expectation.citations.every((text) => report.answer.includes(text)),
      verifiedLocalVaultHandoff: expectation.disposition
        ? handoffAttempt?.plan.disposition === expectation.disposition &&
          handoffAttempt.audience === world.handoff?.audience &&
          (expectation.disposition === "hold"
            ? noHandOffFile && report?.handoff === null
            : Boolean(
                persisted &&
                isDeepStrictEqual(persisted, report?.handoff) &&
                persisted.path === final.view.path &&
                persisted.revision === final.view.revision,
              ))
        : !handoffAttempt && noHandOffFile && report?.handoff === null,
    };
    return {
      caseId: world.id,
      goal: world.goal,
      contextId: input.contextId,
      panelId: input.panelId,
      checks,
      journal,
      events,
      hops,
      writes,
      committedFiles,
      workingFiles,
      final: final.view,
      handoff: persisted,
      passed: Object.values(checks).every(Boolean),
    };
  }

  async function qualify(referenceSteps: readonly Step[] = world.expected.steps) {
    let current = await services.spectroliteGoal.inspect();
    const realLink =
      current.links.find((row) => row.path)?.target ?? "unobserved";
    const rejectsStale =
      (await services.spectroliteGoal.follow(realLink, "stale-view")) ===
      "changed";
    const rejectsAlias =
      (await services.spectroliteGoal.follow(
        "./" + realLink,
        current.revision,
      )) === "unavailable";
    const reads: VaultKnowledgeRead[] = [];
    for (const step of referenceSteps) {
      if (step.kind === "follow") {
        if (
          (await services.spectroliteGoal.follow(
            step.target,
            current.revision,
          )) !== "followed"
        )
          throw new Error("The reference knowledge link was unavailable");
        current = await services.spectroliteGoal.inspect();
      } else if (step.kind === "read") {
        const evidence = await services.spectroliteGoal.evidence(
          step.findings.map(([check]) => check),
        );
        reads.push({
          view: current,
          review: {
            findings: step.findings.map(([check]) => ({
              check,
              code: codes(
                evidence,
                check,
              ) as VaultKnowledgeRead["review"]["findings"][number]["code"],
              detail:
                check === "preview" && evidence.preview?.detail
                  ? evidence.preview.detail
                  : "Read exact native " + check,
              evidenceIds: ids(evidence, check),
            })),
          },
        });
      } else {
        const staleSource =
          world.movement?.path === step.path && !moved
            ? step.source.replace(world.movement.addition, "")
            : step.source;
        let result = await services.spectroliteGoal.revise(
          current.revision,
          staleSource,
        );
        if (result === "changed") {
          current = await services.spectroliteGoal.inspect();
          result = await services.spectroliteGoal.revise(
            current.revision,
            step.source,
          );
        }
        if (result !== "written")
          throw new Error(
            "The reference knowledge edit could not be read back",
          );
        current = await services.spectroliteGoal.inspect();
      }
    }
    let handoff = null;
    let rejectsWrongRecipient = true;
    if (world.handoff) {
      const plan = planFor(await services.spectroliteHandoffRead.evidence());
      rejectsWrongRecipient =
        (await services.vaultKnowledgeHandoff.stage(
          current.revision,
          "another-recipient",
          plan,
        )) === null;
      handoff = await services.vaultKnowledgeHandoff.stage(
        current.revision,
        world.handoff.audience,
        plan,
      );
    }
    const outcome: VaultKnowledgeReport = {
      path: current.path,
      revision: current.revision,
      outcome: world.expected.outcome,
      authorityPath:
        world.expected.outcome === "authority-confirmed"
          ? (world.expected.graph?.authorityPath ?? world.expected.path)
          : null,
      reads,
      answer: world.expected.citations.join(" · "),
      handoff,
    };
    const wrapper = {
      status: "workspace-skill-reviewed",
      skill: world.kind,
      outcome,
    };
    const result = await verify(wrapper);
    const rejectsForgedResult = !(
      await verify({
        ...wrapper,
        outcome: { ...outcome, answer: "unrelated claim" },
      })
    ).passed;
    return {
      ...result,
      checks: {
        ...result.checks,
        rejectsStale,
        rejectsAlias,
        rejectsWrongRecipient,
        rejectsForgedResult,
      },
      passed:
        result.passed &&
        rejectsStale &&
        rejectsAlias &&
        rejectsWrongRecipient &&
        rejectsForgedResult,
    };
  }

  return { services, verify, qualify };
}
