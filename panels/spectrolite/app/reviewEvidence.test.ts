import { describe, expect, it, vi } from "vitest";
import type { VcsReadFileResult } from "@vibestudio/service-schemas/vcs";
import {
  observeVaultReview,
  projectDocumentReviewReceipt,
  projectPublishReviewReceipt,
} from "./reviewEvidence";
import type { VaultVcsPort } from "./semanticVcs";

const committed = { kind: "event", eventId: "ev_17" } as const;
const working = { kind: "application", applicationId: "apply_4" } as const;
const source: NonNullable<VcsReadFileResult> = {
  repositoryId: "repo_7",
  fileId: "file_23",
  repoPath: "projects/default",
  path: "Notes/Arrivals.mdx",
  contentHash: "blob_8",
  contentClass: "external",
  authoredByWorkUnitId: "wu_3",
  authoredChangeId: null,
  externalKeys: ["import:notes:arrivals"],
  mode: 0o644,
  content: {
    kind: "text",
    text: [
      "---",
      "title: First Arrivals",
      "dependencies:",
      "  Chart: panels/arrivals",
      "---",
      "",
      "[[Welcome]]",
      ' <WikiLink target="Notes/Lodging" /> ',
      "",
      "```md",
      "[[Ignored]]",
      "```",
    ].join("\n"),
  },
};

describe("Spectrolite evidence projection", () => {
  it("keeps a successful push result separate from its independent main readback", () => {
    expect(
      projectPublishReviewReceipt(
        "publish",
        "ev_17",
        {
          pendingChanges: 0,
          relationship: "at",
          publishing: false,
          lastError: null,
          conflicts: [],
        },
        { status: "published" },
        null,
      ),
    ).toMatchObject({
      outcome: "published",
      observedMainEventId: null,
      targetEventId: "ev_17",
    });
  });
  it("projects canonical frontmatter, decoded links and the retained external lineage", () => {
    const result = projectDocumentReviewReceipt("document", working, source, [
      "Archive/New/Welcome.mdx",
      "Welcome.mdx",
      "Welcome.md",
    ]);
    expect(result).toMatchObject({
      ref: { kind: "application", id: "apply_4" },
      fileId: "file_23",
      contentHash: "blob_8",
      title: "First Arrivals",
      dependencies: [{ name: "Chart", reference: "panels/arrivals" }],
      links: [
        { target: "Welcome", resolvedPath: "Welcome.mdx" },
        { target: "Notes/Lodging", resolvedPath: null },
      ],
      authoredChangeId: null,
      externalKeys: ["import:notes:arrivals"],
    });
  });

  it("reads and lists through one immutable working reference", async () => {
    const status: Awaited<ReturnType<VaultVcsPort["status"]>> = {
      contextId: "ctx_7",
      committed,
      workingHead: working,
      clean: false,
      mainEventId: "ev_13",
      mainRelation: "ahead",
      workingCounts: { applications: 1, workUnits: 1, changes: 1 },
      integrating: [],
    };
    const resolveRepository: VaultVcsPort["resolveRepository"] = async ({
      state,
      repoPath,
    }) => ({ state, repoPath, repositoryId: "repo_7" });
    const port = {
      status: vi.fn(async () => status),
      resolveRepository: vi.fn(resolveRepository),
      readFile: vi.fn(async () => source),
      listFiles: vi
        .fn<VaultVcsPort["listFiles"]>()
        .mockResolvedValueOnce({
          state: working,
          repositoryId: "repo_7",
          files: [],
          nextCursor: "page_2",
        })
        .mockResolvedValueOnce({
          state: working,
          repositoryId: "repo_7",
          files: [],
          nextCursor: null,
        }),
    };
    const result = await observeVaultReview(
      {
        contextId: "ctx_7",
        repoPath: "projects/default",
        path: "Notes/Arrivals.mdx",
        vaultReceiptId: "vault",
        documentReceiptId: "document",
      },
      port,
    );
    expect(port.resolveRepository).toHaveBeenCalledWith({
      state: working,
      repoPath: "projects/default",
    });
    expect(port.readFile).toHaveBeenCalledWith({
      state: working,
      repositoryId: "repo_7",
      file: { kind: "path", path: "Notes/Arrivals.mdx" },
    });
    expect(port.listFiles.mock.calls.map(([options]) => options)).toEqual([
      { state: working, repositoryId: "repo_7", limit: 500 },
      { state: working, repositoryId: "repo_7", limit: 500, cursor: "page_2" },
    ]);
    expect(result.vault).toMatchObject({
      working: { kind: "application", id: "apply_4" },
      mainEventId: "ev_13",
    });
  });
});
