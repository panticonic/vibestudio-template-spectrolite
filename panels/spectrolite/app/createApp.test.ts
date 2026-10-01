import { beforeEach, expect, it, vi } from "vitest";
const runtime = vi.hoisted(() => ({ set: vi.fn(async () => undefined) }));
vi.mock("@workspace/runtime", () => ({
  contextId: "ctx",
  rpc: {},
  panel: {
    stateArgs: {
      get: () => ({ repoRoot: "notes", openPath: "Original.mdx" }),
      set: runtime.set,
    },
  },
}));
vi.mock("@workspace/agentic-core", () => ({
  createPanelImportLoader: () => vi.fn(),
}));
vi.mock("@vibestudio/service-schemas/clients/eventsClient", () => ({
  EventsClient: class {
    on() {
      return () => undefined;
    }
    async unsubscribeAll() {}
  },
}));
vi.mock("./sessionController", () => ({
  SessionController: class {
    start() {}
    dispose() {}
    onVaultSelected() {}
  },
}));
vi.mock("./publishController", () => ({
  PublishController: class {
    bindSession() {}
    async refresh() {}
  },
}));
vi.mock("./semanticVcs", () => ({
  VaultSemanticVcs: class {
    async listFiles() {
      return [];
    }
  },
}));
vi.mock("../coedit/viewState", () => ({ createViewStateStore: () => ({}) }));
vi.mock("./e2eHooks", () => ({ spectroliteE2EHooksEnabled: () => false }));
import { createSpectroliteApp } from "./createApp";
const collision = {
  fromIndex: 0,
  toIndex: 0,
  oldIds: ["block"],
  liveIds: ["block"],
  oldTexts: ["Old snapshot"],
  newTexts: ["Incoming"],
};
beforeEach(() => runtime.set.mockReset().mockResolvedValue(undefined));
it("propagates failed navigation and retains dirty editor and recovery cards", async () => {
  const app = createSpectroliteApp();
  app.setDirty("Original.mdx", true);
  app.pushCollisions([collision], "notes/Original.mdx");
  const failure = new Error("Saving denied");
  const flush = vi
    .fn()
    .mockRejectedValueOnce(failure)
    .mockResolvedValue(undefined);
  app.registerFlushActiveDoc(flush);
  await expect(app.openFile("Next.mdx")).rejects.toBe(failure);
  expect(app.store.getState()).toMatchObject({
    activePath: "Original.mdx",
    dirtyPaths: ["Original.mdx"],
    navigationError: "Saving denied",
    navigationPending: false,
  });
  expect(runtime.set).not.toHaveBeenCalled();
  await app.openFile("Next.mdx");
  expect(app.store.getState().pendingSuggestions).toHaveLength(1);
  await app.openFile("Original.mdx");
  expect(app.store.getState().pendingSuggestions).toHaveLength(1);
  const persistFailure = new Error("Panel state denied");
  runtime.set.mockRejectedValueOnce(persistFailure);
  await expect(app.openFile("Next.mdx")).rejects.toBe(persistFailure);
  expect(app.store.getState().activePath).toBe("Original.mdx");
  await app.dispose();
});
it("removes a recovery card only after its live editor accepts it", async () => {
  const app = createSpectroliteApp();
  app.pushCollisions([collision], "notes/Original.mdx");
  const id = app.store.getState().pendingSuggestions[0]!.id;
  const resolution = {
    oldIds: ["block"],
    beforeId: "block",
    choice: "accept" as const,
    incomingText: "Incoming",
  };
  expect(() => app.resolveSuggestion(id, resolution)).toThrow("not ready");
  const failure = new Error("Invalid MDX");
  const apply = vi.fn(() => {
    throw failure;
  });
  app.registerSuggestionApplier(apply);
  expect(() => app.resolveSuggestion(id, resolution)).toThrow(failure);
  expect(app.store.getState().pendingSuggestions).toHaveLength(1);
  await app.openFile("Next.mdx");
  expect(() => app.resolveSuggestion(id, resolution)).toThrow("Open the note");
  await app.openFile("Original.mdx");
  app.resolveSuggestion(id, null);
  expect(apply).toHaveBeenCalledTimes(1);
  expect(app.store.getState().pendingSuggestions).toEqual([]);
  await app.dispose();
});
it("joins the final owned save and retains its original failure during disposal", async () => {
  const app = createSpectroliteApp();
  const failure = new Error("Final write denied");
  app.registerFlushActiveDoc(() => Promise.reject(failure));
  await expect(app.dispose()).rejects.toBe(failure);
});
