import { isDeepStrictEqual } from "node:util";
import { type PanelHandle, vcs } from "@workspace/runtime";
import { evalInPanel, waitFor } from "@workspace/testkit";
import {
  observeVaultReview,
  projectDocumentReviewReceipt,
} from "@workspace-panels/spectrolite/review-evidence";
import type {
  LiveVaultRequest,
  NavigationHop,
  PreviewReviewReceipt,
  ReviewCode,
  SpectroliteReviewRequest,
  SpectroliteReviewReport,
  VaultHandoffEvidence,
  VaultHandoffPlan,
} from "../spectrolite-review/types.js";

type BrowserRead = {
  path: string | null;
  text: string;
  phases: PreviewReviewReceipt["phase"][];
  rendered: string[];
  error: string | null;
};
export type LiveVaultWorld = {
  id: string;
  path: string;
  goal: string;
  checks: LiveVaultRequest["checks"];
  heading: string;
  previewText: string | null;
  expected: ReviewCode[];
  requiredText: string[];
  draft?: {
    committedTitle: string;
    staleText: string | null;
    visibleText?: string;
  };
  follow?: { path: string; target: string; destination: string }[];
};

const readEditor = `(() => {
  const editor = document.querySelector('[data-testid="spectrolite-editor"]');
  if (!editor) return null;
  return {
    path: editor.querySelector('[contenteditable="true"]')?.getAttribute('aria-label') ?? null,
    text: editor.innerText,
    phases: Array.from(editor.querySelectorAll('[data-spectrolite-preview]'), node => node.getAttribute('data-spectrolite-preview')),
    rendered: Array.from(editor.querySelectorAll('[data-spectrolite-preview="rendered"]'), node => node.innerText),
    error: editor.querySelector('[data-testid="spectrolite-live-jsx-error"] code')?.textContent ?? null,
  };
})()`;
const phase = ({
  phases,
}: BrowserRead): PreviewReviewReceipt["phase"] | null =>
  phases.includes("render-error")
    ? "render-error"
    : phases.includes("compile-error")
      ? "compile-error"
      : phases.includes("pending")
        ? "pending"
        : phases.includes("rendered")
          ? "rendered"
          : null;

const navigationPaths = (hops: NavigationHop[]) =>
  hops.length ? [...hops.map(({ from }) => from), hops.at(-1)!.to] : [];

function describesRoute(detail: string, hops: NavigationHop[]) {
  let offset = 0;
  return navigationPaths(hops).every((path) => {
    const index = detail.indexOf(path, offset);
    if (index < 0) return false;
    offset = index + path.length;
    return true;
  });
}

export function prepareSpectroliteReview(
  panel: PanelHandle,
  contextId: string,
  repoPath: string,
  world: LiveVaultWorld,
  hops: NavigationHop[],
) {
  let observationFlight: Promise<SpectroliteReviewRequest> | undefined;
  let observed: SpectroliteReviewRequest | undefined;
  let browser: BrowserRead | undefined;
  const { path, goal, checks } = world;
  const request: LiveVaultRequest = { kind: "live-vault", path, goal, checks };

  async function readObservation() {
    const assigned = {
      contextId,
      repoPath,
      path,
      vaultReceiptId: `${contextId}:vault`,
      documentReceiptId: `${contextId}:document`,
    };
    const before = await observeVaultReview(assigned, vcs);
    browser = await waitFor(
      async () => {
        const read = await evalInPanel<BrowserRead | null>(panel, readEditor);
        if (!read || read.path !== path || !read.text.includes(world.heading))
          return undefined;
        if (
          (world.draft?.staleText &&
            read.text.includes(world.draft.staleText)) ||
          (world.draft?.visibleText &&
            !read.text.includes(world.draft.visibleText))
        )
          return undefined;
        const currentPhase = phase(read);
        return world.previewText &&
          (!currentPhase || currentPhase === "pending")
          ? undefined
          : read;
      },
      { label: `Spectrolite shows ${path} and settles its preview` },
    );
    const after = await observeVaultReview(assigned, vcs);
    if (
      !before.document ||
      !after.document ||
      before.document.contentHash !== after.document.contentHash ||
      before.document.fileId !== after.document.fileId ||
      before.vault.working.id !== after.vault.working.id ||
      before.vault.working.kind !== after.vault.working.kind
    )
      throw new Error("The document changed while observing Spectrolite");
    const committedRef = after.vault.committed;
    const committedState =
      committedRef.kind === "event"
        ? { kind: "event" as const, eventId: committedRef.id }
        : { kind: "application" as const, applicationId: committedRef.id };
    const committedDocument = checks.includes("revision")
      ? projectDocumentReviewReceipt(
          `${contextId}:committed-document`,
          committedState,
          await vcs.readFile({
            state: committedState,
            repositoryId: after.vault.repositoryId,
            file: { kind: "path", path },
          }),
          [],
        )
      : null;
    const currentPhase = phase(browser);
    observed = {
      ...after,
      committedDocument,
      path,
      goal,
      checks,
      navigation: hops.length
        ? { id: `${contextId}:navigation`, hops: structuredClone(hops) }
        : null,
      scribeTarget: null,
      handoff: null,
      publication: null,
      preview: currentPhase
        ? {
            id: `${contextId}:preview`,
            documentPath: path,
            contentHash: after.document.contentHash,
            phase: currentPhase,
            detail: browser.error,
          }
        : null,
    };
    return structuredClone(observed);
  }

  async function observe() {
    const pending = observationFlight ??= readObservation();
    try { return structuredClone(await pending); }
    catch (error) { if (observationFlight === pending) observationFlight = undefined; throw error; }
  }

  function reference(): SpectroliteReviewReport {
    if (!observed || !observed.document)
      throw new Error("Missing observed vault document");
    const { vault, document, preview, navigation, committedDocument } =
      observed;
    const route = navigation ? navigationPaths(navigation.hops) : null;
    return {
      findings: checks.map((check) => {
        if (check === "revision") {
          const matches =
            committedDocument?.fileId === document.fileId &&
            committedDocument.path === document.path &&
            committedDocument.repositoryId === vault.repositoryId &&
            committedDocument.ref.kind === vault.committed.kind &&
            committedDocument.ref.id === vault.committed.id;
          const code = !matches
            ? "revision-unverified"
            : committedDocument?.contentHash === document.contentHash
              ? "revision-unchanged"
              : "draft-changed";
          return {
            check,
            code,
            evidenceIds: [
              vault.id,
              document.id,
              ...(committedDocument ? [committedDocument.id] : []),
            ],
            detail: `${path}: ${code}`,
          };
        }
        if (check === "publication")
          return {
            check,
            code: !vault.clean
              ? "working-copy-dirty"
              : vault.relation === "behind" || vault.relation === "diverged"
                ? "integration-required"
                : "publication-missing",
            evidenceIds: [vault.id],
            detail: !vault.clean
              ? "The working copy has uncommitted edits."
              : vault.relation,
          };
        if (check === "navigation") {
          const ready =
            navigation &&
            navigation.hops.at(-1)?.to === path &&
            navigation.hops.every(
              ({ to }, index) =>
                !navigation.hops[index + 1] ||
                to === navigation.hops[index + 1]?.from,
            );
          return {
            check,
            code: !navigation
              ? "navigation-missing"
              : ready
                ? "navigation-ready"
                : "navigation-unverified",
            evidenceIds: [
              vault.id,
              document.id,
              ...(navigation ? [navigation.id] : []),
            ],
            detail: route?.join(" → ") ?? "No observed route",
          };
        }
        const unresolved = document.links.filter(
          ({ resolvedPath }) => resolvedPath === null,
        );
        const code =
          check === "document"
            ? unresolved.length
              ? "broken-link"
              : "document-ready"
            : preview?.phase === "rendered"
              ? "preview-ready"
              : preview?.phase === "compile-error" ||
                  preview?.phase === "render-error"
                ? preview.phase
                : preview?.phase === "pending"
                  ? "preview-pending"
                  : "preview-missing";
        return {
          check,
          code,
          evidenceIds: [
            vault.id,
            document.id,
            ...(check === "preview" && preview ? [preview.id] : []),
          ],
          detail:
            check === "document"
              ? [path, ...unresolved.map(({ target }) => target)].join(" ")
              : preview?.detail || code,
        };
      }),
    };
  }

  function verify(report: SpectroliteReviewReport | null) {
    const expected = observed ? reference() : null;
    const checks = {
      exactNavigation:
        JSON.stringify(observed?.navigation?.hops ?? []) ===
        JSON.stringify(
          (world.follow ?? []).map(
            ({ path: from, target, destination: to }) => ({ from, target, to }),
          ),
        ),
      visiblePreview:
        world.previewText === null ||
        browser?.rendered.some((text) => text.includes(world.previewText!)) ===
          true,
      canonicalDocument:
        observed?.document?.path === world.path &&
        observed.document.ref.kind === observed.vault.working.kind &&
        observed.document.ref.id === observed.vault.working.id &&
        observed.vault.clean === !world.draft,
      committedBaseline:
        !world.draft ||
        (observed?.vault.working.kind === "application" &&
          observed.vault.committed.kind === "event" &&
          observed.committedDocument?.fileId === observed.document?.fileId &&
          observed.committedDocument?.title === world.draft.committedTitle),
      browserIdentity:
        browser?.path === world.path &&
        browser.text.includes(world.heading) &&
        (!world.draft?.staleText ||
          !browser.text.includes(world.draft.staleText)) &&
        (!world.draft?.visibleText ||
          browser.text.includes(world.draft.visibleText)),
      actualDisposition:
        expected?.findings.every(
          ({ code }, index) => code === world.expected[index],
        ) === true,
      matchedFindings:
        Array.isArray(report?.findings) &&
        expected !== null &&
        report.findings.length === expected.findings.length &&
        expected.findings.every((wanted, index) => {
          const actual = report.findings[index];
          return (
            actual?.check === wanted.check &&
            actual.code === wanted.code &&
            JSON.stringify(actual.evidenceIds) ===
              JSON.stringify(wanted.evidenceIds) &&
            typeof actual.detail === "string" &&
            actual.detail.trim().length > 0 &&
            (wanted.check !== "document" ||
              world.requiredText.every((text) =>
                actual.detail.includes(text),
              )) &&
            (wanted.check !== "revision" || actual.detail.includes(path)) &&
            (!observed?.preview?.detail ||
              wanted.check !== "preview" ||
              actual.detail.includes(observed.preview.detail)) &&
            (wanted.check !== "navigation" ||
              Boolean(
                observed?.navigation &&
                describesRoute(actual.detail, observed.navigation.hops),
              ))
          );
        }),
    };
    return {
      caseId: world.id,
      passed: Object.values(checks).every(Boolean),
      checks,
      observed,
      browser,
      expected,
    };
  }

  return {
    request,
    services: { spectroliteRead: { observe } },
    reference,
    verify,
  };
}

export function prepareSpectroliteHandoff(
  review: ReturnType<typeof prepareSpectroliteReview>,
  work: readonly [
    { kind: "domain"; domain: string; operation: string },
    { kind: "domain"; domain: string; operation: string },
  ],
  disposition: VaultHandoffPlan["disposition"],
) {
  let transferred: VaultHandoffEvidence | undefined;
  async function evidence() {
    const { observed } = review.verify(null);
    if (
      !observed?.document ||
      !review.verify(review.reference()).passed
    )
      throw new Error(
        "Read handoff evidence after verifying the assigned vault and editor",
      );
    transferred = structuredClone({
      vault: observed.vault,
      document: observed.document,
      committedDocument: observed.committedDocument ?? null,
      preview: observed.preview,
    });
    return structuredClone(transferred);
  }
  function expected(receipt: VaultHandoffEvidence): VaultHandoffPlan | null {
    const { vault, document, committedDocument, preview } = receipt;
    const previewMatches =
      preview?.phase === "rendered" &&
      preview.documentPath === document.path &&
      preview.contentHash === document.contentHash;
    if (disposition === "hold") {
      return previewMatches
        ? null
        : {
            disposition,
            ref: null,
            contentHash: null,
            evidenceIds: [
              vault.id,
              document.id,
              ...(preview ? [preview.id] : []),
            ],
          };
    }
    if (!committedDocument || !previewMatches) return null;
    return {
      disposition,
      ref: document.ref,
      contentHash: document.contentHash,
      evidenceIds: [vault.id, document.id, committedDocument.id, preview.id],
    };
  }
  function verify(value: unknown) {
    const result = value as { results?: { report: unknown }[] } | null;
    const vault = review.verify(
      (result?.results?.[0]?.report ?? null) as SpectroliteReviewReport | null,
    );
    const plan = result?.results?.[1]?.report as VaultHandoffPlan | undefined;
    const wanted = transferred ? expected(transferred) : null;
    const checks = {
      verifiedVault: vault.passed,
      exactHandoff: wanted !== null && isDeepStrictEqual(plan, wanted),
    };
    return {
      passed: Object.values(checks).every(Boolean),
      checks,
      vault,
      transferred,
    };
  }
  return {
    request: {
      goal:
        review.request.goal +
        " Complete the vault inspection before planning the handoff.",
      work: [
        { ...work[0], input: review.request },
        {
          ...work[1],
          input: { goal: review.request.goal, path: review.request.path },
        },
      ],
    },
    services: { ...review.services, spectroliteHandoffRead: { evidence } },
    verify,
    async qualify() {
      const earlyDenied = await evidence().then(
        () => false,
        () => true,
      );
      await review.services.spectroliteRead.observe();
      const receipt = await evidence();
      const report = review.reference();
      const plan = expected(receipt);
      if (!plan)
        throw new Error(
          "The observed vault cannot support the assigned handoff outcome",
        );
      const withPlan = (candidate: VaultHandoffPlan) => ({
        results: [{ report }, { report: candidate }],
      });
      return {
        verification: verify(withPlan(plan)),
        rejectedDifferentRevision:
          earlyDenied &&
          !verify(
            withPlan({
              ...plan,
              ref: { kind: "event", id: "another-revision" },
            }),
          ).passed,
      };
    },
  };
}
