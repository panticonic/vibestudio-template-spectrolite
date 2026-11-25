import { isDeepStrictEqual } from "node:util";
import { sha256HexSyncText } from "@vibestudio/content-addressing";

type Documents = Record<string, string | null>;
export type VaultWrite = { path: string; from: string; toSourceHash: string };
export type SourceContentEvidence = {
  originalDocuments: Documents;
  observedDocuments: { path: string; revision: string; source: string; sourceHash: string; visible: string; preview?: unknown; binding: unknown }[];
  retainedDocuments: Documents;
  committedDocuments: Documents;
  currentDocument: { path: string; revision: string; source: string; sourceHash: string; visible: string; preview: unknown; binding: unknown };
  writes: VaultWrite[];
  events?: unknown;
  handoff?: unknown;
  journal?: unknown;
  navigationHops?: unknown;
};

/** Native persistence and scope are exact; authored candidate prose is not a fixture recipe. */
export function verifiesScopedVaultWrites(evidence: SourceContentEvidence, editablePaths: readonly string[]): boolean {
  const { originalDocuments, retainedDocuments, writes } = evidence;
  const paths = Object.keys(originalDocuments).sort();
  return isDeepStrictEqual(paths, Object.keys(retainedDocuments).sort()) &&
    paths.every(path => editablePaths.includes(path) || originalDocuments[path] === retainedDocuments[path]) &&
    writes.every(write => editablePaths.includes(write.path)) &&
    editablePaths.every(path => {
      const actual = retainedDocuments[path];
      return typeof actual === "string" && actual !== originalDocuments[path] &&
        writes.findLast(write => write.path === path)?.toSourceHash === sha256HexSyncText(actual);
    }) && evidence.currentDocument.source === retainedDocuments[evidence.currentDocument.path];
}

export function vaultSourceReview(goal: string, editablePaths: readonly string[], sourceContentEvidence: SourceContentEvidence) {
  return {
    semanticReviewRequired: true,
    sourceContentEvidence,
    semanticReviewInput: {
      actual: { goal, ...sourceContentEvidence },
      expected: { goal, editablePaths: [...editablePaths] },
      rubric: "Judge the actual retained vault documents against the original user goal and the authority documents actually observed. Accept semantically equivalent MDX, Markdown, structure and prose. Preserve literal wording when the user requests a verbatim copy, and preserve unrelated facts, working notes and concurrent additions. Reject incorrect facts, omitted required content, unsupported claims, changed protected copy or a result that does not fulfill the requested change. Verify any user-requested navigation, operation order, final open document, rendering and handoff against the actual chronological service journal and native readback. Do not require a hidden reference route or extra review calls. The supplied bytes, editor rendering and revisions are native readback; do not infer success from a returned report or imitate an unseen reference answer.",
    },
  };
}
