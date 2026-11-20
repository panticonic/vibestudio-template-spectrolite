import { describe, expect, it } from "vitest";
import { verifiesKnowledgeGraph } from "./knowledge-graph.js";

const staffing = {
  kind: "read",
  path: "staffing",
  findings: [
    ["document", "document-ready"],
    ["revision", "revision-unchanged"],
  ],
} as const;
const rules = {
  kind: "read",
  path: "rules",
  findings: [["document", "document-ready"]],
} as const;
const before = {
  kind: "read",
  path: "card",
  findings: [["document", "document-ready"]],
} as const;
const write = { kind: "write", path: "card" } as const;
const after = {
  kind: "read",
  path: "card",
  findings: [
    ["document", "document-ready"],
    ["revision", "draft-changed"],
  ],
} as const;
const graph = { basis: [staffing.path, rules.path] };
const reference = [staffing, rules, before, write, after];

describe("Spectrolite graph evidence", () => {
  it("accepts the opposite branch order and findings read separately", () => {
    const alternate = [
      rules,
      { ...staffing, findings: [staffing.findings[1]] },
      { ...staffing, findings: [staffing.findings[0]] },
      before,
      write,
      after,
    ];
    expect(
      verifiesKnowledgeGraph(graph, reference, alternate, alternate.length),
    ).toBe(true);
  });

  it("rejects an evidence source omitted or its proof read after a write", () => {
    expect(
      verifiesKnowledgeGraph(
        graph,
        reference,
        [staffing, before, write, after],
        undefined,
      ),
    ).toBe(false);
    expect(
      verifiesKnowledgeGraph(
        graph,
        reference,
        [staffing, before, write, rules, after],
        undefined,
      ),
    ).toBe(false);
    expect(
      verifiesKnowledgeGraph(
        graph,
        reference,
        [
          { ...staffing, findings: [["preview", "preview-ready"]] },
          rules,
          before,
          write,
          staffing,
          after,
        ],
        undefined,
      ),
    ).toBe(false);
  });

  it("requires an actual post-edit document read before a handoff", () => {
    expect(
      verifiesKnowledgeGraph(graph, reference, reference, reference.length - 1),
    ).toBe(false);
    expect(
      verifiesKnowledgeGraph(
        graph,
        reference,
        [staffing, rules, before, after, write],
        undefined,
      ),
    ).toBe(false);
  });
});
