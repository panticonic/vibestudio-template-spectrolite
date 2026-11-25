type Finding = readonly [string, string];
type Read = { kind: "read"; path: string; findings: readonly Finding[] };
type Write = { kind: "write"; path: string };
type GraphEvent =
  | Read
  | Write
  | { kind: "follow"; from: string; target: string; to: string };

export type KnowledgeGraphExpectation = {
  /** Native sources that must inform each change, in any encounter order. */
  basis: readonly string[];
  /** The decision source may differ from the final open or handoff document. */
  authorityPath?: string;
};

const isRead = (step: GraphEvent): step is Read => step.kind === "read";
/** Check evidence dependencies without prescribing a navigation path. */
export function verifiesKnowledgeGraph(
  graph: KnowledgeGraphExpectation,
  reference: readonly GraphEvent[],
  actual: readonly GraphEvent[],
  handoffAt: number | undefined,
): boolean {
  // A source can be read both before and after its edit. Selecting prerequisites
  // by path across the entire reference would demand the future edit's proof
  // before that edit. Only the initial evidence can authorize mutations.
  const firstWrite = reference.findIndex(step => step.kind === "write");
  const prerequisiteReads = reference.slice(0, firstWrite < 0 ? reference.length : firstWrite).filter(isRead);
  const basis = prerequisiteReads.filter(step => graph.basis.includes(step.path));
  if (graph.basis.some(path => !basis.some(read => read.path === path))) return false;
  const beforeHandoff = handoffAt ?? actual.length;
  const readDocument = (path: string, start: number, end: number) =>
    actual
      .slice(start, end)
      .some(
        (step) =>
          isRead(step) &&
          step.path === path &&
          step.findings.some(([check]) => check === "document"),
      );

  // Source inspection establishes reading; preview/revision findings are not
  // a prescribed report route. Their requested meaning is judged against the
  // actual native observations by the separate mandatory outcome review.
  if (!basis.every(read => readDocument(read.path, 0, beforeHandoff))) return false;

  for (const [index, step] of actual.entries()) {
    if (step.kind !== "write") continue;
    if (
      index >= beforeHandoff ||
      !basis.every(read => readDocument(read.path, 0, index)) ||
      !readDocument(step.path, 0, index) ||
      !readDocument(step.path, index + 1, beforeHandoff)
    )
      return false;
  }
  return true;
}
