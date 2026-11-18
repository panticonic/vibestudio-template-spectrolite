import { describe, expect, it } from "vitest";
import { verifySpectroliteWorld } from "./verify.js";
import { spectroliteWorlds } from "./worlds.js";

describe("Spectrolite task outcomes", () => {
  it("requires all four composed findings in the requested order", () => {
    const task = spectroliteWorlds.find(
      ({ id }) => id === "spectrolite-entire-handoff",
    )!;
    const findings = [
      {
        check: "document",
        code: "document-ready",
        evidenceIds: ["vault-state", "document-read"],
        detail: "The working reference names Host Guide.",
      },
      {
        check: "preview",
        code: "preview-ready",
        evidenceIds: ["vault-state", "document-read", "preview-read"],
        detail: "The preview rendered blob_d02.",
      },
      {
        check: "handoff",
        code: "handoff-verified",
        evidenceIds: ["vault-state", "handoff-read"],
        detail: "The recipient received ev_42.",
      },
      {
        check: "publication",
        code: "publication-pending",
        evidenceIds: ["vault-state", "publication-read"],
        detail: "Publication is still active.",
      },
    ] as const;
    const report = {
      findings: findings.map((finding) => ({
        ...finding,
        evidenceIds: [...finding.evidenceIds],
      })),
    };
    expect(verifySpectroliteWorld(task, report)).toBe(true);
    expect(
      verifySpectroliteWorld(task, { findings: report.findings.slice(0, -1) }),
    ).toBe(false);
    expect(
      verifySpectroliteWorld(task, {
        findings: [...report.findings].reverse(),
      }),
    ).toBe(false);
    expect(
      verifySpectroliteWorld(task, {
        findings: report.findings.map((finding) =>
          finding.check === "publication"
            ? { ...finding, code: "publication-verified" }
            : finding,
        ),
      }),
    ).toBe(false);
    expect(
      verifySpectroliteWorld(task, {
        findings: report.findings.map((finding) =>
          finding.check === "preview"
            ? {
                ...finding,
                evidenceIds: ["vault-state", "document-read", "stale-preview"],
              }
            : finding,
        ),
      }),
    ).toBe(false);
  });
});
