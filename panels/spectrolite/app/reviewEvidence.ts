/** Project an explicit Spectrolite review assignment without changing vault state. */
import type {
  VcsReadFileResult,
  VcsStateNodeRef,
} from "@vibestudio/service-schemas/vcs";
import type {
  DocumentReviewReceipt,
  PublishReviewReceipt,
  VaultReviewState,
} from "../../../skills/spectrolite-review/types.js";
import { parseFrontmatter } from "../mdx/frontmatter";
import { extractWikilinks, resolveWikilinkTarget } from "../mdx/wikilink";
import type { VaultRevision, VaultVcsPort } from "./semanticVcs";
import type { PublishOutcome, PublishSnapshot } from "./publishController";

function reference(value: VcsStateNodeRef) {
  return value.kind === "event"
    ? { kind: value.kind, id: value.eventId }
    : { kind: value.kind, id: value.applicationId };
}

function sameReference(left: VcsStateNodeRef, right: VcsStateNodeRef): boolean {
  const first = reference(left);
  const second = reference(right);
  return first.kind === second.kind && first.id === second.id;
}

export function projectPublishReviewReceipt(
  id: string,
  targetEventId: string,
  snapshot: PublishSnapshot,
  outcome: PublishOutcome | null,
  mainReadback: VaultReviewState | null,
): PublishReviewReceipt {
  return {
    id,
    targetEventId,
    observedMainEventId: mainReadback?.mainEventId ?? null,
    outcome: outcome?.status ?? null,
    publishing: snapshot.publishing,
    conflicts: snapshot.conflicts.map(({ coordinate, summary }) => ({
      ...coordinate,
      summary,
    })),
    lastError:
      snapshot.lastError ??
      (outcome?.status === "error" ? outcome.message : null),
  };
}

export function projectVaultReviewState(
  id: string,
  revision: VaultRevision,
): VaultReviewState {
  const { repositoryId, status } = revision;
  return {
    id,
    repositoryId,
    working: reference(status.workingHead),
    committed: reference(status.committed),
    mainEventId: status.mainEventId,
    clean: status.clean,
    relation: status.mainRelation,
  };
}

export function projectDocumentReviewReceipt(
  id: string,
  ref: VcsStateNodeRef,
  readback: VcsReadFileResult,
  paths: string[],
): DocumentReviewReceipt | null {
  if (!readback) return null;
  const {
    repositoryId,
    path,
    fileId,
    contentHash,
    content,
    contentClass,
    authoredChangeId,
    authoredByWorkUnitId,
    externalKeys,
  } = readback;
  const text = content.kind === "text" ? content.text : null;
  const frontmatter = text === null ? null : parseFrontmatter(text);
  return {
    id,
    repositoryId,
    path,
    fileId,
    contentHash,
    ref: reference(ref),
    format: text === null ? "other" : "text",
    contentClass,
    authoredChangeId,
    authoredByWorkUnitId,
    externalKeys: [...externalKeys],
    title: frontmatter?.title ?? null,
    dependencies: Object.entries(frontmatter?.dependencies ?? {}).map(
      ([name, reference]) => ({ name, reference }),
    ),
    links:
      text === null
        ? []
        : extractWikilinks(text).map((target) => ({
            target,
            resolvedPath: resolveWikilinkTarget(target, paths),
          })),
  };
}

export async function observeVaultReview(
  assigned: {
    contextId: string;
    repoPath: string;
    path: string;
    vaultReceiptId: string;
    documentReceiptId: string;
  },
  vcs: Pick<
    VaultVcsPort,
    "status" | "resolveRepository" | "readFile" | "listFiles"
  >,
): Promise<{
  vault: VaultReviewState;
  document: DocumentReviewReceipt | null;
}> {
  const status = await vcs.status({ contextId: assigned.contextId });
  const state = status.workingHead;
  const repository = await vcs.resolveRepository({
    state,
    repoPath: assigned.repoPath,
  });
  if (!repository)
    throw new Error(
      "The assigned vault is absent from the captured working reference",
    );
  const repositoryId = repository.repositoryId;
  if (
    !sameReference(repository.state, state) ||
    repository.repoPath !== assigned.repoPath
  )
    throw new Error(
      "The repository receipt does not match the assigned vault and working reference",
    );
  const file = await vcs.readFile({
    state,
    repositoryId,
    file: { kind: "path", path: assigned.path },
  });
  const paths: string[] = [];
  if (
    file?.content.kind === "text" &&
    extractWikilinks(file.content.text).length
  ) {
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await vcs.listFiles({
        state,
        repositoryId,
        limit: 500,
        ...(cursor ? { cursor } : {}),
      });
      if (
        page.repositoryId !== repositoryId ||
        !sameReference(page.state, state)
      )
        throw new Error(
          "The vault file listing does not match the assigned repository and working reference",
        );
      paths.push(...page.files.map(({ path }) => path));
      cursor = page.nextCursor ?? undefined;
      if (cursor && seen.has(cursor))
        throw new Error("The vault file listing repeated its cursor");
      if (cursor) seen.add(cursor);
    } while (cursor);
  }
  return {
    vault: projectVaultReviewState(assigned.vaultReceiptId, {
      repositoryId,
      status,
    }),
    document: projectDocumentReviewReceipt(
      assigned.documentReceiptId,
      state,
      file,
      paths,
    ),
  };
}
