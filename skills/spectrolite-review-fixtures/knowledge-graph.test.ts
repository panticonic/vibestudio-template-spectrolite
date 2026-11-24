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

// Actual native reference failure: both cards were correctly changed and read
// back, but path-selected prerequisites incorrectly included future edit proof.
const authority = {kind:"read",path:"Accessibility Ruling.mdx",findings:[["document","document-ready"]]} as const;
const visitor = {kind:"read",path:"working/Visitor Entry Card.mdx",findings:[["document","document-ready"]]} as const;
const visitorAfter = {...visitor,findings:[["document","document-ready"],["preview","preview-ready"],["revision","draft-changed"]]} as const;
const steward = {kind:"read",path:"working/Steward Card.mdx",findings:[["document","document-ready"]]} as const;
const stewardAfter = {...steward,findings:[["document","document-ready"],["revision","draft-changed"]]} as const;
const visitorWrite = {kind:"write",path:visitor.path} as const;
const stewardWrite = {kind:"write",path:steward.path} as const;
const compound = [
  authority,
  {kind:"follow",from:authority.path,target:"Visitor Entry Card",to:visitor.path},
  visitor,visitorWrite,visitorAfter,
  {kind:"follow",from:visitor.path,target:"Steward Card",to:steward.path},
  steward,stewardWrite,stewardAfter,
] as const;
const compoundGraph = {basis:[authority.path,visitor.path]};

it("admits the actual compound native reference without requiring future revision proof",()=>{
  expect(verifiesKnowledgeGraph(compoundGraph,compound,compound,undefined)).toBe(true);
});

it("accepts redundant authored reads covered by one grouped proof before and after mutation",()=>{
  const repeatedReference = [authority,authority,visitor,visitor,visitorWrite,visitorAfter,visitorAfter];
  const groupedActual = [authority,visitor,visitorWrite,
    {...visitorAfter,findings:[visitorAfter.findings[2]]},
    {...visitorAfter,findings:[visitorAfter.findings[0],visitorAfter.findings[1]]},
  ];
  expect(verifiesKnowledgeGraph(compoundGraph,repeatedReference,groupedActual,undefined)).toBe(true);
});

it("keeps compound authority and post-write proof required before handoff",()=>{
  expect(verifiesKnowledgeGraph(compoundGraph,compound,compound.filter(event=>event!==authority),undefined)).toBe(false);
  expect(verifiesKnowledgeGraph(compoundGraph,compound,[...compound.slice(1),authority],undefined)).toBe(false);
  expect(verifiesKnowledgeGraph(compoundGraph,compound,compound.filter(event=>event!==stewardAfter),undefined)).toBe(false);
  expect(verifiesKnowledgeGraph(compoundGraph,compound,compound,compound.length-1)).toBe(false);
});

it("rejects a requested source whose only reference proof would occur after mutation",()=>{
  // An explicit authority source remains required before mutation even when a
  // malformed reference places it after the edit; it cannot silently disappear.
  const futureAuthority = [visitor,visitorWrite,authority,visitorAfter];
  expect(verifiesKnowledgeGraph({basis:[authority.path]},futureAuthority,futureAuthority,undefined)).toBe(false);
});
