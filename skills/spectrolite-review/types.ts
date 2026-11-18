export type VaultReference = { kind: "event" | "application"; id: string };
export type VaultReviewState = {
  id: string;
  repositoryId: string;
  working: VaultReference;
  committed: VaultReference;
  mainEventId: string;
  clean: boolean;
  relation: "at" | "ahead" | "behind" | "diverged";
};
export type DocumentReviewReceipt = {
  id: string;
  repositoryId: string;
  path: string;
  ref: VaultReference;
  fileId: string;
  contentHash: string;
  format: "text" | "other";
  contentClass: "internal" | "external";
  authoredChangeId: string | null;
  authoredByWorkUnitId: string | null;
  externalKeys: string[];
  title: string | null;
  dependencies: { name: string; reference: string }[];
  links: { target: string; resolvedPath: string | null }[];
};
export type PreviewReviewReceipt = {
  id: string;
  documentPath: string;
  contentHash: string;
  phase: "pending" | "rendered" | "compile-error" | "render-error";
  detail: string | null;
};
export type ScribeReviewReceipt = {
  id: string;
  documentPath: string;
  recipientId: string;
  eventId: string | null;
  phase: "unsent" | "sent" | "failed";
  selection: string | null;
};
export type PublishReviewReceipt = {
  id: string;
  targetEventId: string;
  observedMainEventId: string | null;
  outcome: "published" | "up-to-date" | "error" | null;
  publishing: boolean;
  conflicts: { kind: "file" | "repository"; id: string; summary: string }[];
  lastError: string | null;
};
export type ReviewCheck = "document" | "preview" | "handoff" | "publication";
export type SpectroliteReviewRequest = {
  goal: string;
  checks: ReviewCheck[];
  path: string;
  vault: VaultReviewState;
  document: DocumentReviewReceipt | null;
  preview: PreviewReviewReceipt | null;
  scribeTarget: { recipientId: string; selection: string | null } | null;
  handoff: ScribeReviewReceipt | null;
  publication: PublishReviewReceipt | null;
};
export type ReviewCode =
  | "document-ready"
  | "lineage-missing"
  | "broken-link"
  | "non-text"
  | "document-missing"
  | "wrong-document"
  | "stale-document"
  | "preview-ready"
  | "preview-missing"
  | "stale-preview"
  | "preview-pending"
  | "compile-error"
  | "render-error"
  | "handoff-verified"
  | "recipient-unassigned"
  | "handoff-missing"
  | "handoff-unsent"
  | "handoff-failed"
  | "wrong-recipient"
  | "wrong-selection"
  | "dirty-before-handoff"
  | "stale-handoff"
  | "publication-verified"
  | "publication-missing"
  | "publication-pending"
  | "working-copy-dirty"
  | "integration-required"
  | "conflict-unresolved"
  | "publication-failed"
  | "unconfirmed-publication"
  | "wrong-published-event";
export type ReviewFinding = {
  check: ReviewCheck;
  code: ReviewCode;
  evidenceIds: string[];
  detail: string;
};
export type SpectroliteReviewReport = { findings: ReviewFinding[] };

export type LiveVaultRequest = {
  kind: "live-vault";
  goal: string;
  path: string;
  checks: ("document" | "preview")[];
};
export type SpectroliteWorkflowRequest =
  | SpectroliteReviewRequest
  | LiveVaultRequest;
