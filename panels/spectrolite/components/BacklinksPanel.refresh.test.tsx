// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Theme } from "@radix-ui/themes";
import { BacklinksPanel } from "./BacklinksPanel";
import type { Backlink } from "../state/backlinks";

const fixtures = vi.hoisted(() => ({
  state: {
    repoRoot: "vault",
    activePath: "Target.mdx",
    paths: ["From.mdx"],
    pathContentHashes: {},
  },
  scan: vi.fn(),
  app: {
    vault: { mapping: () => ({ toVcsPath: (path: string) => path }) },
    openFile: vi.fn(),
  },
}));
vi.mock("@workspace/runtime", () => ({ blobstore: {} }));
vi.mock("../app/context", () => ({
  useApp: () => fixtures.app,
  useAppState: (selector: (state: typeof fixtures.state) => unknown) =>
    selector(fixtures.state),
}));
vi.mock("../state/backlinks", () => ({ findBacklinks: fixtures.scan }));
function deferred() {
  let resolve!: (result: Backlink[]) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<Backlink[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const panel = () => (
  <Theme>
    <BacklinksPanel />
  </Theme>
);
const links = [{ fromPath: "From.mdx", snippet: "[[Target]]" }];
beforeEach(() => {
  fixtures.state.activePath = "Target.mdx";
  fixtures.state.pathContentHashes = {};
  fixtures.scan.mockReset();
});
afterEach(cleanup);

it("keeps backlinks mounted during rescans and shows refresh failures without erasing results", async () => {
  fixtures.scan.mockResolvedValueOnce(links);
  const view = render(panel());
  const link = await screen.findByRole("button", {
    name: /From\.mdx/,
  });
  const pending = deferred();
  fixtures.scan.mockReturnValueOnce(pending.promise);
  fixtures.state.pathContentHashes = { "From.mdx": "changed" };
  view.rerender(panel());
  expect(screen.queryByText("Scanning…")).toBeNull();
  expect(screen.getByRole("button", { name: /From\.mdx/ })).toBe(
    link,
  );
  await act(async () => pending.reject(new Error("Scan failed")));
  expect(screen.getByRole("alert").textContent).toBe("Scan failed");
  expect(screen.getByRole("button", { name: /From\.mdx/ })).toBe(
    link,
  );
  fixtures.scan.mockResolvedValueOnce(links);
  fixtures.state.pathContentHashes = { "From.mdx": "recovered" };
  view.rerender(panel());
  await act(async () => {});
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("button", { name: /From\.mdx/ })).toBe(
    link,
  );
});

it("clears the previous note on navigation and ignores its outstanding scan", async () => {
  fixtures.scan.mockResolvedValueOnce(links);
  const view = render(panel());
  await screen.findByRole("button", { name: /From\.mdx/ });
  const old = deferred();
  fixtures.scan.mockReturnValueOnce(old.promise);
  fixtures.state.pathContentHashes = { "From.mdx": "old" };
  view.rerender(panel());
  const next = deferred();
  fixtures.scan.mockReturnValueOnce(next.promise);
  fixtures.state.activePath = "Other.mdx";
  view.rerender(panel());
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Scanning…")).toBeTruthy();
  await act(async () => old.resolve(links));
  expect(screen.queryByRole("button")).toBeNull();
  await act(async () => next.resolve([]));
  expect(screen.getByText(/Nothing links here yet/).textContent).toContain(
    "Other",
  );
});

it("reports an initial scan failure without claiming the note has no backlinks", async () => {
  fixtures.scan.mockRejectedValueOnce(new Error("Vault unavailable"));
  render(panel());
  expect((await screen.findByRole("alert")).textContent).toBe("Vault unavailable");
  expect(screen.queryByText(/Nothing links here yet/)).toBeNull();
  expect(screen.queryByText("Scanning…")).toBeNull();
});
