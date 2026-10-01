import { expect, it } from "vitest";
import { nodeToMdxSource, nodesToMdxSource } from "./mdastSerialize";

it("preserves legitimate empty fragments and reports unsupported content without substituting empty text", () => {
  expect(nodesToMdxSource([])).toBe("");
  expect(
    nodeToMdxSource({
      type: "paragraph",
      children: [{ type: "text", value: "Keep this text" }],
    }),
  ).toBe("Keep this text");
  expect(() =>
    nodeToMdxSource({ type: "unsupported", value: "Keep this text" }),
  ).toThrow();
  expect(() =>
    nodesToMdxSource([
      { type: "unsupported", value: "Keep this text" } as never,
    ]),
  ).toThrow();
});
