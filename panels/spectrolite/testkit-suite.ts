/** Spectrolite's in-system UI and semantic-context collaboration suite. */

import { contextId, vcs } from "@workspace/runtime";
import {
  evalInPanel,
  expect,
  panelText,
  profilePanel,
  suite,
  waitFor,
  waitForText,
  withPanel,
  audit,
  setViewport,
} from "@workspace/testkit";

const VAULT = "projects/default";
const LARGE_VAULT = VAULT;

function command(kind: string): string {
  return `testkit:spectrolite:${kind}:${crypto.randomUUID()}`;
}

function vaultPanelOptions(
  repoRoot: string,
  openPath: string,
  timeoutMs?: number,
) {
  return {
    contextId,
    stateArgs: { repoRoot, openPath },
    ...(timeoutMs ? { timeoutMs } : {}),
  };
}

const FIXTURES: Record<string, string> = {
  "E2E.mdx":
    "---\ntitle: E2E\ntags: [e2e]\n---\n\n# E2E Note\n\nA simple note for end-to-end editor interactions.\n",
  "Linked.mdx":
    "---\ntitle: Linked\n---\n\n# Linked\n\nThis note points at [[E2E]].\n",
  "Broken.mdx":
    "---\ntitle: Broken\n---\n\n# Broken\n\nThis document keeps the editor usable around malformed JSX.\n\n<BrokenWidget\n",
};

async function ensureVault(repoPath: string, files: Record<string, string>) {
  const status = await vcs.status({ contextId });
  let repositoryId: string | null = null;
  let cursor: string | undefined;
  do {
    const page = await vcs.neighbors({
      root: status.workingHead,
      limit: 500,
      ...(cursor ? { cursor } : {}),
    });
    const nodes = page.edges.flatMap((edge) =>
      edge.kind === "contains-repository" && edge.to.kind === "repository"
        ? [edge.to]
        : [],
    );
    const inspected = await Promise.all(
      nodes.map((node) => vcs.inspect({ node, edgeLimit: 1 })),
    );
    for (const result of inspected) {
      if (
        result.node.kind === "repository" &&
        result.node.value.kind === "present" &&
        result.node.value.repoPath === repoPath
      ) {
        repositoryId = result.node.value.repositoryId;
      }
    }
    cursor = repositoryId ? undefined : (page.nextCursor ?? undefined);
  } while (cursor);
  if (!repositoryId)
    throw new Error(`Spectrolite fixture repository '${repoPath}' is absent`);

  const listed = await vcs.listFiles({
    state: status.workingHead,
    repositoryId,
    limit: 500,
  });
  const byPath = new Map(listed.files.map((file) => [file.path, file]));
  const changes = await Promise.all(
    Object.entries(files).map(async ([path, text]) => {
      const current = byPath.get(path);
      if (!current) {
        return {
          kind: "file-create" as const,
          repositoryId,
          path,
          content: { kind: "text" as const, text },
          mode: 0o644,
        };
      }
      const existing = await vcs.readFile({
        state: status.workingHead,
        repositoryId,
        file: { kind: "id", fileId: current.fileId },
      });
      if (existing?.content.kind === "text" && existing.content.text === text)
        return null;
      if (!existing || existing.content.kind !== "text") {
        throw new Error(`Spectrolite fixture '${path}' is not a text file`);
      }
      return {
        kind: "text-edit" as const,
        repositoryId,
        fileId: current.fileId,
        edits: [{ start: 0, end: existing.content.text.length, text }],
      };
    }),
  );
  const effective = changes.filter(
    (change): change is NonNullable<typeof change> => change !== null,
  );
  if (effective.length === 0) {
    return { repositoryId, workingHead: status.workingHead };
  }
  const changed = await vcs.edit({
    contextId,
    expectedWorkingHead: status.workingHead,
    commandId: command("seed-vault"),
    changes: effective,
  });
  return { repositoryId, workingHead: changed.workingHead };
}

function largeVaultFiles(): Record<string, string> {
  const files: Record<string, string> = {
    "Hub.mdx": "---\ntitle: Large Hub\n---\n\n# Large Hub\n\nCentral node.\n",
  };
  for (let index = 0; index < 60; index += 1) {
    files[`Bulk-${index}.mdx`] =
      `---\ntitle: Bulk ${index}\n---\n\n# Bulk-${index}\n\nLinks back to [[Hub]].\n`;
  }
  return files;
}

export const spectrolite = suite("spectrolite", {
  timeoutMs: 120_000,
  usesPanelAutomation: true,
})
  .test(
    "opens a preselected vault and renders the requested document",
    async () => {
      await ensureVault(VAULT, FIXTURES);
      await withPanel(
        "panels/spectrolite",
        async (handle) => {
          await waitForText(handle, "E2E Note", { timeoutMs: 60_000 });
          const hasEditor = await evalInPanel<boolean>(
            handle,
            `Boolean(document.querySelector('[data-testid="spectrolite-editor"]'))`,
          );
          expect(hasEditor, "editor rendered").toBe(true);
          expect(
            await panelText(handle),
            "vault placeholder leakage",
          ).not.toContain("/projects/<not-selected-yet>");
        },
        vaultPanelOptions(VAULT, "E2E.mdx"),
      );
    },
  )
  .test("follows wikilinks between notes", async () => {
    await ensureVault(VAULT, FIXTURES);
    await withPanel(
      "panels/spectrolite",
      async (handle) => {
        await waitForText(handle, "points at", { timeoutMs: 60_000 });
        await waitFor(
          () =>
            evalInPanel<boolean>(
              handle,
              `Boolean(document.querySelector('[data-wikilink], .wikilink'))`,
            ),
          { timeoutMs: 30_000, label: "wikilink renders" },
        );
        await evalInPanel(
          handle,
          `document.querySelector('[data-wikilink], .wikilink')?.click()`,
        );
        await waitForText(handle, "E2E Note", { timeoutMs: 30_000 });
      },
      vaultPanelOptions(VAULT, "Linked.mdx"),
    );
  })
  .test("stays usable around malformed MDX", async (t) => {
    await ensureVault(VAULT, FIXTURES);
    await withPanel(
      "panels/spectrolite",
      async (handle) => {
        t.supervisor.unwatchPanel(handle.id);
        await waitForText(handle, /usable around malformed JSX|Broken/, {
          timeoutMs: 60_000,
        });
        const editable = await waitFor(
          () =>
            evalInPanel<boolean>(
              handle,
              `Boolean(document.querySelector('[contenteditable="true"]'))`,
            ),
          { timeoutMs: 30_000, label: "editor stays interactive" },
        );
        expect(editable, "editor interactive with broken MDX open").toBe(true);
      },
      vaultPanelOptions(VAULT, "Broken.mdx"),
    );
  })
  .test(
    "records authored changes and seals the complete local chain",
    async () => {
      const seeded = await ensureVault(VAULT, FIXTURES);
      const before = await vcs.status({ contextId });
      const file = await vcs.readFile({
        state: before.workingHead,
        repositoryId: seeded.repositoryId,
        file: { kind: "path", path: "E2E.mdx" },
      });
      if (!file?.fileId || file.content.kind !== "text")
        throw new Error("fixture file unavailable");
      const edited = await vcs.edit({
        contextId,
        expectedWorkingHead: before.workingHead,
        commandId: command("coedit"),
        changes: [
          {
            kind: "text-edit",
            repositoryId: seeded.repositoryId,
            fileId: file.fileId,
            edits: [
              {
                start: file.content.text.length,
                end: file.content.text.length,
                text: "\nSemantic co-editor marker\n",
              },
            ],
          },
        ],
      });
      expect(edited.changeIds.length > 0, "edit has semantic changes").toBe(
        true,
      );
      const committed = await vcs.commit({
        contextId,
        expectedWorkingHead: edited.workingHead,
        commandId: command("commit"),
        message: "Co-editor semantic change",
      });
      expect(committed.event.eventId.length > 0, "atomic workspace event").toBe(
        true,
      );
      expect(
        committed.committedApplicationIds.includes(edited.applicationId),
        "authored application included",
      ).toBe(true);
      const story = await vcs.compare({
        target: before.committed,
        source: { kind: "event", eventId: committed.event.eventId },
        limit: 100,
      });
      expect(
        story.coordinates.some((coordinate) =>
          coordinate.attribution.theirs.some((change) =>
            edited.changeIds.includes(change.changeId),
          ),
        ),
        "comparison walks authored change",
      ).toBe(true);
    },
  )
  .test(
    "stays responsive in a larger vault (with CPU profile attached)",
    async (t) => {
      await ensureVault(LARGE_VAULT, largeVaultFiles());
      await withPanel(
        "panels/spectrolite",
        async (handle) => {
          await waitForText(handle, "Large Hub", { timeoutMs: 90_000 });
          const ref = await profilePanel(handle, async () => {
            const responsive = await evalInPanel<boolean>(
              handle,
              `Boolean(document.querySelector('[data-testid="spectrolite-editor"]'))`,
            );
            if (!responsive)
              throw new Error("editor unresponsive during refresh");
            await new Promise((resolve) => setTimeout(resolve, 2_000));
          });
          t.log(
            `cpu profile: ${ref.path} (${ref.summary.totalSamples} samples)`,
          );
        },
        vaultPanelOptions(LARGE_VAULT, "Hub.mdx", 90_000),
      );
    },
  );

/** Installed first-use/edit/reopen acceptance, independent of optional artwork. */
export const spectroliteJourney = suite("spectrolite-journey", {
  timeoutMs: 180_000,
  usesPanelAutomation: true,
}).test(
  "selects a vault, edits a note, navigates away and restores accepted content",
  async (t) => {
    const seeded = await ensureVault(VAULT, {
      "Journey.mdx": "# My first note\n\nKeep my original paragraph.\n",
      "JourneyNext.mdx": "# Another note\n",
    });
    await withPanel(
      "panels/spectrolite",
      async (handle) => {
        await setViewport(handle, { width: 1280, height: 844 });
        await waitForText(handle, "Open a vault");
        await handle.click('[data-testid="spectrolite-vault-default"]');
        await waitForText(handle, "Open a file");
        await handle.click('[aria-label="Files"]');
        await handle.click('.spectrolite-file-row[title="Journey.mdx"]');
        await waitForText(handle, "Keep my original paragraph.");
        const session = await handle.cdp.session();
        const page = session.page;
        const editor = page.getByRole("textbox", { name: "Journey.mdx" });
        await editor.click();
        await page.keyboard.press("Control+End");
        await page.keyboard.press("Enter");
        await page.keyboard.type("My accepted journey edit.");
        // Navigation flushes the editor through its real semantic owner.
        await handle.click('[aria-label="Files"]');
        await handle.click('.spectrolite-file-row[title="JourneyNext.mdx"]');
        await waitForText(handle, "Another note");
        const status = await vcs.status({ contextId });
        const persisted = await vcs.readFile({
          state: status.workingHead,
          repositoryId: seeded.repositoryId,
          file: { kind: "path", path: "Journey.mdx" },
        });
        expect(
          persisted?.content.kind === "text" &&
            persisted.content.text.includes("My accepted journey edit."),
          "edit is durable before leaving the note",
        ).toBe(true);
        await handle.click('[aria-label="Files"]');
        await handle.click('.spectrolite-file-row[title="Journey.mdx"]');
        await waitForText(handle, "My accepted journey edit.");
        await handle.reload();
        await waitForText(handle, "My accepted journey edit.");
        expect(
          await panelText(handle),
          "original paragraph retained",
        ).toContain("Keep my original paragraph.");
        for (const width of [320, 390, 1280]) {
          await setViewport(handle, { width, height: 844 });
          expect(
            (await audit(handle)).horizontalOverflow,
            `editor layout at ${width}`,
          ).toBe(false);
        }
        t.log(
          "Selected vault and accepted note edits survived renderer replacement.",
        );
      },
      { contextId, focus: false },
    );
  },
);
