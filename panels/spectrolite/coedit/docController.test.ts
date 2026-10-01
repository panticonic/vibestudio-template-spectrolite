import { describe, expect, it, vi } from "vitest";
import {
  DocController,
  type CoEditEditor,
  type DocVcs,
} from "./docController.js";

const working = {
  kind: "application" as const,
  applicationId: "application:working",
};

function editorState(initial = "") {
  let canonical = initial;
  const callbacks: Array<() => void> = [];
  const editor: CoEditEditor = {
    getCanonical: () => canonical,
    setCanonical: (value) => {
      canonical = value;
    },
    rebase: () => undefined,
    getBlocks: () => [],
    getLiveBlockIds: () => new Set(),
    getDirtyCommit: () => ({
      canonical,
      dirty: [
        {
          baseStart: "# Base\n".length,
          baseEnd: "# Base\n".length,
          newText: "\nLocal\n",
        },
      ],
    }),
    applyContained: vi.fn(),
    applyStructural: vi.fn(),
    onUserEdit: (callback) => {
      callbacks.push(callback);
      return () => undefined;
    },
  };
  return {
    editor,
    callbacks,
    canonical: () => canonical,
    setCanonical: (value: string) => {
      canonical = value;
      callbacks.forEach((callback) => callback());
    },
  };
}

function vcs(overrides: Partial<DocVcs> = {}): DocVcs {
  return {
    readFile: async () => ({
      repositoryId: "repo:notes",
      repoPath: "projects/default",
      fileId: "file:note",
      path: "Note.mdx",
      content: { kind: "text", text: "# Base\n" },
      contentHash: "blob:base",
      authoredChangeId: "change:base",
      authoredByWorkUnitId: "work:base",
      contentClass: "internal",
      externalKeys: [],
      mode: 0o644,
    }),
    edit: async () => {
      throw new Error("unexpected edit");
    },
    commit: async () => {
      throw new Error("unexpected commit");
    },
    refresh: async () => ({ status: { workingHead: working } }),
    ...overrides,
  };
}

describe("DocController", () => {
  it("does not author serialization normalization when opening, flushing or closing an unchanged note", async () => {
    const state = editorState();
    state.editor.setCanonical = (value) => state.setCanonical(value.trimEnd());
    const edit = vi.fn<DocVcs["edit"]>();
    const controller = new DocController({
      editor: state.editor,
      vcs: vcs({ edit }),
      splitBlocks: () => [],
      onCollisions: vi.fn(),
      setTimer: () => 1,
      clearTimer: vi.fn(),
    });
    await controller.load("projects/default/Note.mdx");
    expect(state.canonical()).toBe("# Base");
    expect(controller.isDirty()).toBe(false);
    await controller.flushNow();
    await controller.dispose();
    expect(edit).not.toHaveBeenCalled();
  });
  it("loads from the exact working state without a second subscription model", async () => {
    const state = editorState();
    const controller = new DocController({
      editor: state.editor,
      vcs: vcs(),
      splitBlocks: () => [],
      onCollisions: vi.fn(),
      setTimer: () => 1,
      clearTimer: vi.fn(),
    });

    await controller.load("projects/default/Note.mdx");
    expect(state.canonical()).toBe("# Base\n");
    expect(controller.isDirty()).toBe(false);
    await controller.dispose();
  });

  it("authors strict hunks against the state the editor observed", async () => {
    const state = editorState();
    const timers: Array<{ fn: () => void; delay: number }> = [];
    const next = {
      kind: "application" as const,
      applicationId: "application:edited",
    };
    const edit = vi.fn<DocVcs["edit"]>(async () => ({
      previousWorkingHead: working,
      workingHead: next,
      changeIds: ["change:local"],
      paths: ["projects/default/Note.mdx"],
    }));
    const controller = new DocController({
      editor: state.editor,
      vcs: vcs({ edit }),
      splitBlocks: () => [],
      onCollisions: vi.fn(),
      editDebounceMs: 5,
      observationMs: 999,
      setTimer: (fn, delay) => {
        timers.push({ fn, delay });
        return timers.length;
      },
      clearTimer: vi.fn(),
    });

    await controller.load("projects/default/Note.mdx");
    state.setCanonical("# Base\n\nLocal\n");
    state.callbacks[0]?.();
    timers.find((timer) => timer.delay === 5)?.fn();
    await vi.waitFor(() => expect(edit).toHaveBeenCalledOnce());
    expect(edit.mock.calls[0]?.[1]).toEqual(working);
    expect(edit.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        kind: "replace",
        path: "projects/default/Note.mdx",
      }),
    ]);
    await controller.dispose();
  });

  it("adds an observed agent-authored document transition to semantic undo", async () => {
    const state = editorState();
    const timers: Array<{ fn: () => void; delay: number }> = [];
    const remote = {
      kind: "application" as const,
      applicationId: "application:remote",
    };
    const refresh = vi
      .fn<DocVcs["refresh"]>()
      .mockResolvedValueOnce({ status: { workingHead: working } })
      .mockResolvedValue({ status: { workingHead: remote } });
    const readFile = vi
      .fn<DocVcs["readFile"]>()
      .mockResolvedValueOnce({
        repositoryId: "repo:notes",
        repoPath: "projects/default",
        fileId: "file:note",
        path: "Note.mdx",
        content: { kind: "text", text: "# Base\n" },
        contentHash: "blob:base",
        authoredChangeId: "change:base",
        authoredByWorkUnitId: "work:base",
        contentClass: "internal",
        externalKeys: [],
        mode: 0o644,
      })
      .mockResolvedValue({
        repositoryId: "repo:notes",
        repoPath: "projects/default",
        fileId: "file:note",
        path: "Note.mdx",
        content: { kind: "text", text: "# Agent edit\n" },
        contentHash: "blob:remote",
        authoredChangeId: "change:agent",
        authoredByWorkUnitId: "work:scribe",
        contentClass: "internal",
        externalKeys: [],
        mode: 0o644,
      });
    // This fixture models the editor applying the remote structural insertion.
    state.editor.applyStructural = (operation) =>
      state.setCanonical(operation.newTexts.join("\n\n"));
    const sealCommit = vi.fn();
    const controller = new DocController({
      editor: state.editor,
      vcs: vcs({ refresh, readFile }),
      splitBlocks: (markdown) => [
        {
          id: "remote",
          signature: markdown,
          text: markdown,
          start: 0,
          end: markdown.length,
        },
      ],
      onCollisions: vi.fn(),
      undo: { sealCommit },
      observationMs: 5,
      setTimer: (fn, delay) => {
        timers.push({ fn, delay });
        return timers.length;
      },
      clearTimer: vi.fn(),
    });

    await controller.load("projects/default/Note.mdx");
    timers.find((timer) => timer.delay === 5)?.fn();

    await vi.waitFor(() =>
      expect(sealCommit).toHaveBeenCalledWith(["change:agent"]),
    );
    await controller.dispose();
  });

  it("reports canonical MDX failures as unsaved instead of leaking a timer rejection", async () => {
    const state = editorState();
    const timers: Array<{ fn: () => void; delay: number }> = [];
    const onSaveError = vi.fn();
    const controller = new DocController({
      editor: state.editor,
      vcs: vcs(),
      splitBlocks: () => [],
      onCollisions: vi.fn(),
      onSaveError,
      editDebounceMs: 5,
      setTimer: (fn, delay) => {
        timers.push({ fn, delay });
        return timers.length;
      },
      clearTimer: vi.fn(),
    });

    await controller.load("projects/default/Note.mdx");
    state.editor.getDirtyCommit = () => {
      throw new Error("Unexpected end of MDX expression");
    };
    state.setCanonical("{broken");
    state.callbacks[0]?.();
    timers.find((timer) => timer.delay === 5)?.fn();

    await vi.waitFor(() =>
      expect(onSaveError).toHaveBeenCalledWith(
        "projects/default/Note.mdx",
        expect.objectContaining({
          message: "Unexpected end of MDX expression",
        }),
      ),
    );
    expect(controller.isDirty()).toBe(true);
    await expect(controller.flushNow()).rejects.toThrow(
      "Cannot leave or publish this note",
    );
    await expect(controller.dispose()).rejects.toThrow(
      "Unexpected end of MDX expression",
    );
  });

  it("flushes the newest editor text when disposal races an in-flight edit", async () => {
    const state = editorState();
    const timers: Array<{ fn: () => void; delay: number }> = [];
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = {
      kind: "application" as const,
      applicationId: "application:first",
    };
    const second = {
      kind: "application" as const,
      applicationId: "application:second",
    };
    const edit = vi.fn<DocVcs["edit"]>(async () => {
      if (edit.mock.calls.length === 1) {
        await firstPending;
        return {
          previousWorkingHead: working,
          workingHead: first,
          changeIds: ["change:first"],
          paths: ["projects/default/Note.mdx"],
        };
      }
      return {
        previousWorkingHead: first,
        workingHead: second,
        changeIds: ["change:second"],
        paths: ["projects/default/Note.mdx"],
      };
    });
    const controller = new DocController({
      editor: state.editor,
      vcs: vcs({ edit }),
      splitBlocks: () => [],
      onCollisions: vi.fn(),
      editDebounceMs: 5,
      observationMs: 999,
      setTimer: (fn, delay) => {
        timers.push({ fn, delay });
        return timers.length;
      },
      clearTimer: vi.fn(),
    });

    await controller.load("projects/default/Note.mdx");
    state.setCanonical("# Base\n\nFirst\n");
    state.callbacks[0]?.();
    timers.find((timer) => timer.delay === 5)?.fn();
    await vi.waitFor(() => expect(edit).toHaveBeenCalledOnce());

    state.setCanonical("# Base\n\nNewest\n");
    const disposal = controller.dispose();
    releaseFirst();
    await disposal;

    await vi.waitFor(() => expect(edit).toHaveBeenCalledTimes(2));
    expect(edit.mock.calls[1]?.[0]).toEqual([
      expect.objectContaining({
        kind: "replace",
        path: "projects/default/Note.mdx",
        hunks: [
          expect.objectContaining({
            newText: expect.stringContaining("Newest"),
          }),
        ],
      }),
    ]);
  });
});

it("joins a pending save on disposal and propagates failure without losing the visible text", async () => {
  const state = editorState();
  let fail!: (error: Error) => void;
  const original = new Error("Save permission denied");
  const pending = new Promise<never>((_, reject) => {
    fail = reject;
  });
  const edit = vi.fn(() => pending);
  const controller = new DocController({
    editor: state.editor,
    vcs: vcs({ edit }),
    splitBlocks: () => [],
    onCollisions: vi.fn(),
    setTimer: () => 1,
    clearTimer: vi.fn(),
  });
  await controller.load("projects/default/Note.mdx");
  state.setCanonical("# Base\n\nKeep my final edit\n");
  const disposal = controller.dispose();
  const rejected = expect(disposal).rejects.toBe(original);
  expect(controller.dispose()).toBe(disposal);
  expect(edit).toHaveBeenCalledOnce();
  fail(original);
  await rejected;
  expect(state.canonical()).toContain("Keep my final edit");
  expect(controller.isDirty()).toBe(true);
});

it("joins in-flight observation without applying its result to a retired editor", async () => {
  const state = editorState();
  const timers: Array<() => void> = [];
  let finish!: (value: Awaited<ReturnType<DocVcs["readFile"]>>) => void;
  const original = await vcs().readFile("Note.mdx", working);
  const readFile = vi
    .fn<DocVcs["readFile"]>()
    .mockResolvedValueOnce(original)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const refresh = vi
    .fn<DocVcs["refresh"]>()
    .mockResolvedValueOnce({ status: { workingHead: working } })
    .mockResolvedValue({
      status: { workingHead: { kind: "application", applicationId: "remote" } },
    });
  const changed = vi.fn();
  const controller = new DocController({
    editor: state.editor,
    vcs: vcs({ readFile, refresh }),
    splitBlocks: () => [],
    onCollisions: vi.fn(),
    onWorkingStateChange: changed,
    setTimer: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimer: vi.fn(),
  });
  await controller.load("Note.mdx");
  timers[0]!();
  await vi.waitFor(() => expect(readFile).toHaveBeenCalledTimes(2));
  let settled = false;
  const disposal = controller.dispose().then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  finish({
    ...original!,
    content: { kind: "text", text: "Remote result after retirement" },
  });
  await disposal;
  expect(state.canonical()).toBe("# Base\n");
  expect(state.editor.applyStructural).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});
