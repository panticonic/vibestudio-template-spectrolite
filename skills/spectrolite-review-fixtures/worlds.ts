import type {
  DocumentReviewReceipt,
  PreviewReviewReceipt,
  PublishReviewReceipt,
  ReviewCheck,
  ReviewCode,
  ScribeReviewReceipt,
  SpectroliteReviewRequest,
  VaultReviewState,
} from "../spectrolite-review/types.js";

export type SpectroliteWorld = {
  id: string;
  sourceGroup: string;
  request: SpectroliteReviewRequest;
  expected: {
    check: ReviewCheck;
    code: ReviewCode;
    evidenceIds: string[];
    detailIncludes: string[];
  }[];
};

const committed = { kind: "event", id: "ev_42" } as const;
const main = "ev_28";
const working = { kind: "application", id: "apply_59" } as const;

function scenario(
  name: string,
  group: string,
  path: string,
  goal: string,
  findings: [ReviewCheck, ReviewCode][],
  receipts: {
    vault?: Partial<VaultReviewState>;
    document?: Partial<DocumentReviewReceipt> | null;
    preview?: Partial<PreviewReviewReceipt> | null;
    scribeTarget?: SpectroliteReviewRequest["scribeTarget"];
    handoff?: Partial<ScribeReviewReceipt> | null;
    publication?: Partial<PublishReviewReceipt> | null;
  } = {},
): SpectroliteWorld {
  const vault: VaultReviewState = {
    id: "vault-state",
    repositoryId: "repo_017",
    working: committed,
    committed,
    mainEventId: committed.id,
    clean: true,
    relation: "at",
    ...receipts.vault,
  };
  const document: DocumentReviewReceipt | null =
    receipts.document === null
      ? null
      : {
          id: "document-read",
          repositoryId: vault.repositoryId,
          path,
          ref: vault.working,
          fileId: "file_3",
          contentHash: "blob_d02",
          format: "text",
          contentClass: "internal",
          authoredChangeId: "chg_077",
          authoredByWorkUnitId: "work_59",
          externalKeys: [],
          title: null,
          dependencies: [],
          links: [],
          ...receipts.document,
        };
  const preview: PreviewReviewReceipt | null =
    receipts.preview === null
      ? null
      : {
          id: "preview-read",
          documentPath: path,
          contentHash: "blob_d02",
          phase: "rendered",
          detail: null,
          ...receipts.preview,
        };
  const handoff: ScribeReviewReceipt | null =
    receipts.handoff === null
      ? null
      : {
          id: "handoff-read",
          documentPath: path,
          recipientId: "member_12",
          eventId: committed.id,
          phase: "sent",
          selection: null,
          ...receipts.handoff,
        };
  const publication: PublishReviewReceipt | null =
    receipts.publication === null
      ? null
      : {
          id: "publication-read",
          targetEventId: committed.id,
          observedMainEventId: committed.id,
          outcome: "published",
          publishing: false,
          conflicts: [],
          lastError: null,
          ...receipts.publication,
        };
  const scopes: Record<ReviewCheck, (string | undefined)[]> = {
    document: [document?.id],
    preview: [document?.id, preview?.id],
    navigation: [document?.id],
    handoff: [handoff?.id],
    publication: [publication?.id],
  };
  const exactDetails: Partial<
    Record<ReviewCode, (string | null | undefined)[]>
  > = {
    "broken-link": document?.links
      .filter((link) => link.resolvedPath === null)
      .map((link) => link.target),
    "compile-error": [preview?.detail],
    "render-error": [preview?.detail],
    "publication-failed": [publication?.lastError],
  };
  return {
    id: `spectrolite-${name}`,
    sourceGroup: `vibestudio:spectrolite:${group}`,
    request: {
      goal,
      path,
      checks: findings.map(([check]) => check),
      vault,
      document,
      preview,
      scribeTarget:
        receipts.scribeTarget === undefined
          ? { recipientId: "member_12", selection: null }
          : receipts.scribeTarget,
      handoff,
      publication,
    },
    expected: findings.map(([check, code]) => ({
      check,
      code,
      detailIncludes: (exactDetails[code] ?? []).filter(
        (part): part is string => Boolean(part),
      ),
      evidenceIds: [
        vault.id,
        ...scopes[check].filter((id): id is string => id !== undefined),
      ],
    })),
  };
}

export const spectroliteWorlds = [
  scenario(
    "field-index",
    "document-link-coverage",
    "Botany/Index.mdx",
    "Check if the field index has navigable canonical links.",
    [["document", "document-ready"]],
    {
      document: {
        title: "Field Index",
        links: [{ target: "Marsh", resolvedPath: "Botany/Marsh.mdx" }],
      },
    },
  ),
  scenario(
    "lecture-notice",
    "document-link-coverage",
    "Lectures/Notice.mdx",
    "Find the broken reference in the current lecture notice.",
    [["document", "broken-link"]],
    {
      document: {
        links: [
          { target: "Lectures/Map", resolvedPath: null },
          { target: "Schedule", resolvedPath: "Schedule.mdx" },
        ],
      },
    },
  ),
  scenario(
    "cookbook-move",
    "document-import-lineage",
    "Kitchen/Autumn.mdx",
    "The imported recipe moved during co-edit. Is its origin still attached?",
    [["document", "document-ready"]],
    {
      document: {
        contentClass: "external",
        externalKeys: ["import:recipes:starter"],
        authoredChangeId: "rename_05",
      },
    },
  ),
  scenario(
    "field-notes-origin",
    "document-import-lineage",
    "Field/Survey.mdx",
    "Check whether the imported survey still records an upstream source.",
    [["document", "lineage-missing"]],
    {
      document: {
        contentClass: "external",
        authoredChangeId: "chg_import",
        authoredByWorkUnitId: "wu_import",
      },
    },
  ),
  scenario(
    "lineage-without-local-edit",
    "document-import-lineage",
    "Inbox/Manual.mdx",
    "Review the source lineage of the vendor manual before adapting it.",
    [["document", "document-ready"]],
    {
      document: {
        contentClass: "external",
        externalKeys: ["source:vendor:manual"],
        authoredChangeId: null,
        authoredByWorkUnitId: null,
      },
    },
  ),
  scenario(
    "map-is-binary",
    "document-receipt-boundaries",
    "Atlas/Map.mdx",
    "Check whether this canonical file is available as Spectrolite text.",
    [["document", "non-text"]],
    { document: { format: "other" } },
  ),
  scenario(
    "note-never-received",
    "document-receipt-boundaries",
    "Workshops/Arrival.mdx",
    "Review the arrival note at the selected reference.",
    [["document", "document-missing"]],
    { document: null },
  ),
  scenario(
    "same-name-other-vault",
    "document-receipt-boundaries",
    "Overview.mdx",
    "Make sure Overview comes from the selected vault.",
    [["document", "wrong-document"]],
    { document: { repositoryId: "repo_archived" } },
  ),
  scenario(
    "renamed-while-inspecting",
    "document-receipt-boundaries",
    "Archive/Chronology.mdx",
    "Confirm the renamed note exists at its current canonical path.",
    [["document", "wrong-document"]],
    { document: { path: "Draft/Chronology.mdx" } },
  ),
  scenario(
    "same-id-different-ref-kind",
    "document-current-ref",
    "Closings/Keys.mdx",
    "Check this note against the current working application after the edit.",
    [["document", "stale-document"]],
    {
      vault: { working, clean: false },
      document: { ref: { kind: "event", id: working.id } },
    },
  ),
  scenario(
    "older-event-after-sync",
    "document-current-ref",
    "Intake/Checklist.mdx",
    "Review the checklist after the latest sync.",
    [["document", "stale-document"]],
    { document: { ref: { kind: "event", id: "ev_41" } } },
  ),
  scenario(
    "local-draft-no-upstream",
    "document-current-ref",
    "Notes/Agenda.mdx",
    "Inspect the agenda in my current draft before saving it.",
    [["document", "document-ready"]],
    {
      vault: { working, clean: false },
      document: { authoredChangeId: null, authoredByWorkUnitId: null },
    },
  ),
  scenario(
    "badge-preview",
    "preview-content-identity",
    "Badges/Progress.mdx",
    "Does the preview correspond to my current progress badge draft?",
    [["preview", "preview-ready"]],
    { vault: { working, clean: false } },
  ),
  scenario(
    "gallery-stale-hash",
    "preview-content-identity",
    "Gallery/Index.mdx",
    "The gallery may be showing a previous revision. Check the rendered preview.",
    [["preview", "stale-preview"]],
    { preview: { contentHash: "blob_older" } },
  ),
  scenario(
    "matching-hash-wrong-file",
    "preview-content-identity",
    "Inventory/Empty.mdx",
    "Verify whether the captured preview belongs to this entry, even if another entry has identical text.",
    [["preview", "stale-preview"]],
    { preview: { documentPath: "Other/Empty.mdx" } },
  ),
  scenario(
    "foreign-vault-preview",
    "preview-content-identity",
    "Travel/Plan.mdx",
    "Verify this preview is from the active trip vault.",
    [["preview", "stale-preview"]],
    { document: { repositoryId: "repo_duplicate" } },
  ),
  scenario(
    "preview-on-stale-read",
    "preview-content-identity",
    "Experiments/Ledger.mdx",
    "A preview and note seem to match. Determine if both are for the current vault revision.",
    [["preview", "stale-preview"]],
    { vault: { working, clean: false }, document: { ref: committed } },
  ),
  scenario(
    "preview-no-canonical-read",
    "preview-observation-lifecycle",
    "Calendar/Summer.mdx",
    "Can the calendar preview be confirmed if canonical text did not load?",
    [["preview", "preview-missing"]],
    { document: null },
  ),
  scenario(
    "preview-not-observed",
    "preview-observation-lifecycle",
    "Reports/Friday.mdx",
    "Find out whether the Friday report preview is available.",
    [["preview", "preview-missing"]],
    { preview: null },
  ),
  scenario(
    "component-pending",
    "preview-observation-lifecycle",
    "Dashboard/Meter.mdx",
    "Have the meter's current component children rendered yet?",
    [["preview", "preview-pending"]],
    { preview: { phase: "pending" } },
  ),
  scenario(
    "invalid-prop-syntax",
    "preview-observation-lifecycle",
    "Readouts/Quarter.mdx",
    "Locate the boundary of the reported quarter readout failure.",
    [["preview", "compile-error"]],
    {
      preview: {
        phase: "compile-error",
        detail: "Unexpected closing tag at line 5",
      },
    },
  ),
  scenario(
    "data-dependent-render-failure",
    "preview-observation-lifecycle",
    "Workshop/Boxes.mdx",
    "Review the error after the component starts rendering the assigned draft.",
    [["preview", "render-error"]],
    {
      preview: {
        phase: "render-error",
        detail: "BoxGrid requires at least one row",
      },
    },
  ),
  scenario(
    "failed-old-preview",
    "preview-observation-lifecycle",
    "Guide/Colors.mdx",
    "Decide if yesterday's render failure applies to today's document.",
    [["preview", "stale-preview"]],
    { preview: { phase: "render-error", contentHash: "blob_yesterday" } },
  ),
  scenario(
    "scribe-selected-quote",
    "handoff-selection",
    "Drafts/Chapter.mdx",
    "Check if the scribe has the precise quoted passage and saved event.",
    [["handoff", "handoff-verified"]],
    {
      scribeTarget: {
        recipientId: "member_12",
        selection: "Bring the grey book.",
      },
      handoff: { selection: "Bring the grey book." },
    },
  ),
  scenario(
    "scribe-reselected-before-dispatch",
    "handoff-selection",
    "Drafts/Audio.mdx",
    "Was the selected time stamp in the handoff the one I just assigned?",
    [["handoff", "wrong-selection"]],
    {
      scribeTarget: { recipientId: "member_12", selection: "02:17" },
      handoff: { selection: "02:15" },
    },
  ),
  scenario(
    "scribe-selection-omitted",
    "handoff-selection",
    "Indexes/Training.mdx",
    "Confirm the handoff preserved the highlighted fragment.",
    [["handoff", "wrong-selection"]],
    {
      scribeTarget: { recipientId: "member_12", selection: "Arrival note" },
      handoff: { selection: null },
    },
  ),
  scenario(
    "scribe-whole-note",
    "handoff-selection",
    "Notes/Weekly.mdx",
    "Confirm the saved whole note was sent for structure feedback.",
    [["handoff", "handoff-verified"]],
  ),
  scenario(
    "scribe-addressee-not-picked",
    "handoff-recipient",
    "Comments/Scribe.mdx",
    "Check whether an exact intended recipient is available for this review.",
    [["handoff", "recipient-unassigned"]],
    { scribeTarget: null },
  ),
  scenario(
    "scribe-addressed-to-another-participant",
    "handoff-recipient",
    "Planning/Sessions.mdx",
    "Did the stored handoff go to the intended collaborator?",
    [["handoff", "wrong-recipient"]],
    { handoff: { recipientId: "member_14" } },
  ),
  scenario(
    "scribe-wrong-note",
    "handoff-recipient",
    "Notes/Session 2.mdx",
    "Check if the prior scribe message was about this session's note.",
    [["handoff", "wrong-document"]],
    { handoff: { documentPath: "Notes/Session 1.mdx" } },
  ),
  scenario(
    "scribe-no-sent-receipt",
    "handoff-dispatch",
    "Prose/Sketch.mdx",
    "Can the handoff for my sketch be verified from what was captured?",
    [["handoff", "handoff-missing"]],
    { handoff: null },
  ),
  scenario(
    "typed-mention-is-draft",
    "handoff-dispatch",
    "Notes/Ideas.mdx",
    "I typed a scribe mention in the draft. Verify whether it was sent.",
    [["handoff", "handoff-unsent"]],
    { handoff: { phase: "unsent" } },
  ),
  scenario(
    "scribe-send-failed",
    "handoff-dispatch",
    "Tasks/Editing.mdx",
    "The handoff errored after save. Check its actual send state.",
    [["handoff", "handoff-failed"]],
    { handoff: { phase: "failed" } },
  ),
  scenario(
    "scribe-new-unsaved-edits",
    "handoff-commit-order",
    "Review/Color Study.mdx",
    "Does the handoff cover the exact document now visible in my working copy?",
    [["handoff", "dirty-before-handoff"]],
    { vault: { working, clean: false } },
  ),
  scenario(
    "scribe-stale-committed-event",
    "handoff-commit-order",
    "Drafts/Outline.mdx",
    "A second save followed the handoff. Check whether the scribe has the newest event.",
    [["handoff", "stale-handoff"]],
    { handoff: { eventId: "ev_39" } },
  ),
  scenario(
    "scribe-missing-event-marker",
    "handoff-commit-order",
    "Chapters/Chapter 8.mdx",
    "Confirm if the handoff contains enough metadata to bind the saved version.",
    [["handoff", "stale-handoff"]],
    { handoff: { eventId: null } },
  ),
  scenario(
    "scribe-application-not-event",
    "handoff-commit-order",
    "Vault/Index.mdx",
    "Check if this handoff even names a sealed event.",
    [["handoff", "stale-handoff"]],
    {
      vault: { committed: working, working },
      handoff: { eventId: working.id },
    },
  ),
  scenario(
    "full-publish-readback",
    "publication-main-readback",
    "Notes/Current.mdx",
    "Confirm the current document event really reached protected main.",
    [["publication", "publication-verified"]],
  ),
  scenario(
    "already-current-event",
    "publication-main-readback",
    "Manual/Intro.mdx",
    "Does the up-to-date reply establish publication for this exact event?",
    [["publication", "publication-verified"]],
    { publication: { outcome: "up-to-date" } },
  ),
  scenario(
    "unlinked-main-readback",
    "publication-main-readback",
    "Briefs/Monday.mdx",
    "Does the publication receipt establish which event the main branch observed?",
    [["publication", "unconfirmed-publication"]],
    { publication: { observedMainEventId: null } },
  ),
  scenario(
    "receipt-target-alias",
    "publication-main-readback",
    "Briefs/Tues.mdx",
    "Was this exact committed version published, or a different event?",
    [["publication", "wrong-published-event"]],
    { publication: { targetEventId: "ev_40" } },
  ),
  scenario(
    "main-changed-after-publish",
    "publication-main-readback",
    "Atlas/North.mdx",
    "Main has another event now. Verify if it matches the confirmed target.",
    [["publication", "wrong-published-event"]],
    { vault: { mainEventId: "ev_43" } },
  ),
  scenario(
    "ahead-even-with-success-receipt",
    "publication-main-readback",
    "Maps/South.mdx",
    "Local appears ahead. Confirm whether current publication is actually established.",
    [["publication", "wrong-published-event"]],
    { vault: { relation: "ahead", mainEventId: main } },
  ),
  scenario(
    "publish-in-flight",
    "publication-lifecycle",
    "Reports/Focus.mdx",
    "Has the requested publication finished?",
    [["publication", "publication-pending"]],
    { publication: { publishing: true, outcome: null } },
  ),
  scenario(
    "publish-error-after-sync",
    "publication-lifecycle",
    "Minutes/Board.mdx",
    "Check the actual result after local integration passed and push hit an error.",
    [["publication", "publication-failed"]],
    {
      publication: {
        outcome: "error",
        lastError: "expected main event changed",
      },
    },
  ),
  scenario(
    "publish-clean-but-no-receipt",
    "publication-lifecycle",
    "Stacks/Spring.mdx",
    "Check whether a clean local branch proves the new publication.",
    [["publication", "publication-missing"]],
    { publication: null },
  ),
  scenario(
    "publish-dirty-start",
    "publication-lifecycle",
    "Manual/Notes.mdx",
    "Is the current local edit ready for publication?",
    [["publication", "working-copy-dirty"]],
    { vault: { working, clean: false }, publication: null },
  ),
  scenario(
    "publish-main-integrate",
    "publication-integration",
    "Minutes/Today.mdx",
    "Review the publish evidence after protected main advanced without our local copy.",
    [["publication", "integration-required"]],
    { vault: { relation: "behind", mainEventId: main }, publication: null },
  ),
  scenario(
    "publish-divergent-clean",
    "publication-integration",
    "Interviews/Handoff.mdx",
    "Both histories changed without conflicts being reviewed. What is the relevant publication stage?",
    [["publication", "integration-required"]],
    { vault: { relation: "diverged", mainEventId: main }, publication: null },
  ),
  scenario(
    "publish-integrate-conflict",
    "publication-integration",
    "Cases/Arrival.mdx",
    "Read the conflicting file coordinate before treating the result as published.",
    [["publication", "conflict-unresolved"]],
    {
      vault: { relation: "diverged" },
      publication: {
        outcome: "error",
        conflicts: [
          {
            kind: "file",
            id: "file_3",
            summary: "Arrival time changed on both branches",
          },
        ],
      },
    },
  ),
  scenario(
    "publish-repo-coordinate",
    "publication-integration",
    "Guide/Shape.mdx",
    "Review whether a repository grouping choice is still outstanding.",
    [["publication", "conflict-unresolved"]],
    {
      publication: {
        conflicts: [
          {
            kind: "repository",
            id: "repo_017",
            summary: "The vault moved to distinct roots",
          },
        ],
      },
    },
  ),
  scenario(
    "render-and-publish-disagree",
    "multi-boundary-review",
    "Maps/Legend.mdx",
    "First review the rendered legend, then check whether the canonical version was published.",
    [
      ["preview", "preview-ready"],
      ["publication", "working-copy-dirty"],
    ],
    { vault: { working, clean: false } },
  ),
  scenario(
    "review-peer-before-publish",
    "multi-boundary-review",
    "Annual/Changelog.mdx",
    "Check both the Scribe receipt and the exact protected-main event.",
    [
      ["handoff", "wrong-recipient"],
      ["publication", "publication-verified"],
    ],
    { handoff: { recipientId: "member_other" } },
  ),
  scenario(
    "document-works-preview-stale",
    "multi-boundary-review",
    "Index/Routes.mdx",
    "Check the note links, then decide if the existing rendered preview is current.",
    [
      ["document", "document-ready"],
      ["preview", "stale-preview"],
    ],
    {
      document: { links: [{ target: "Bus", resolvedPath: "Index/Bus.mdx" }] },
      preview: { contentHash: "blob_old" },
    },
  ),
  scenario(
    "entire-handoff",
    "multi-boundary-review",
    "Welcome/Host Guide.mdx",
    "Review the canonical note, current preview, explicit Scribe dispatch and recorded publication in order.",
    [
      ["document", "document-ready"],
      ["preview", "preview-ready"],
      ["handoff", "handoff-verified"],
      ["publication", "publication-pending"],
    ],
    { publication: { publishing: true, outcome: null } },
  ),
  scenario(
    "publish-before-public-check",
    "multi-boundary-review",
    "Invites/Room.mdx",
    "Review publication first and then check whether the source note still has its import key.",
    [
      ["publication", "publication-verified"],
      ["document", "lineage-missing"],
    ],
    { document: { contentClass: "external" } },
  ),
];
