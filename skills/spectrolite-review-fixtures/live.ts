import { type PanelHandle, vcs } from "@workspace/runtime";
import { evalInPanel, waitFor } from "@workspace/testkit";
import { observeVaultReview } from "@workspace-panels/spectrolite/review-evidence";
import type {
  LiveVaultRequest,
  PreviewReviewReceipt,
  ReviewCode,
  SpectroliteReviewRequest,
  SpectroliteReviewReport,
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

export function prepareSpectroliteReview(
  panel: PanelHandle,
  contextId: string,
  repoPath: string,
  world: LiveVaultWorld,
) {
  let started = false;
  let observed: SpectroliteReviewRequest | undefined;
  let browser: BrowserRead | undefined;
  const { path, goal, checks } = world;
  const request: LiveVaultRequest = { kind: "live-vault", path, goal, checks };

  async function observe() {
    if (started) throw new Error("Read the assigned Spectrolite document once");
    started = true;
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
    const currentPhase = phase(browser);
    observed = {
      ...after,
      path,
      goal,
      checks,
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

  function reference(): SpectroliteReviewReport {
    if (!observed || !observed.document)
      throw new Error("Missing observed vault document");
    const { vault, document, preview } = observed;
    return {
      findings: checks.map((check) => {
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
      visiblePreview:
        world.previewText === null ||
        browser?.rendered.some((text) => text.includes(world.previewText!)) ===
          true,
      canonicalDocument:
        observed?.document?.path === world.path && observed.vault.clean,
      browserIdentity:
        browser?.path === world.path && browser.text.includes(world.heading),
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
            (!observed?.preview?.detail ||
              wanted.check !== "preview" ||
              actual.detail.includes(observed.preview.detail))
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
