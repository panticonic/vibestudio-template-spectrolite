import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { page, userEvent } from "@vitest/browser/context";
import { afterEach, expect, it, vi } from "vitest";
import { AppProvider } from "../app/context";
import type { SpectroliteApp } from "../app/createApp";
import { initialState } from "../app/state";
import { createStore } from "../app/store";
import { SuggestionStack } from "./SuggestionCard";
import "@radix-ui/themes/styles.css";

afterEach(cleanup);
it("keeps rejected suggestions actionable and restores focus after keyboard resolution", async () => {
  await page.viewport(320, 800);
  const store = createStore(
    initialState({
      contextId: "ctx",
      channelName: null,
      repoRoot: "notes",
      openPath: "Note.mdx",
    }),
  );
  store.setState({
    pendingSuggestions: [
      {
        id: "suggestion",
        vcsPath: "notes/Note.mdx",
        collision: {
          fromIndex: 0,
          toIndex: 0,
          oldIds: ["block"],
          liveIds: ["block"],
          oldTexts: ["Original text"],
          newTexts: ["Incoming change"],
        },
      },
    ],
  });
  let reject = true;
  const resolveSuggestion = vi.fn((id: string, resolution: unknown) => {
    if (reject && resolution)
      throw new Error("The note is not ready to apply this suggestion");
    store.setState({
      pendingSuggestions: store
        .getState()
        .pendingSuggestions.filter((s) => s.id !== id),
    });
  });
  const app = {
    store,
    vault: { mapping: () => ({ toVcsPath: (p: string) => `notes/${p}` }) },
    resolveSuggestion,
  } as unknown as SpectroliteApp;
  render(
    <Theme>
      <AppProvider value={app}>
        <div style={{ position: "relative", height: 600 }}>
          <div
            contentEditable
            role="textbox"
            aria-label="Note.mdx"
            suppressContentEditableWarning
          >
            My newest text
          </div>
          <SuggestionStack />
        </div>
      </AppProvider>
    </Theme>,
  );
  const accept = screen.getByRole("button", { name: "Accept" });
  accept.focus();
  await act(() => userEvent.keyboard("{Enter}"));
  expect(screen.getByRole("alert").textContent).toContain("not ready");
  expect(document.activeElement).toBe(accept);
  expect(screen.getByRole("textbox").textContent).toBe("My newest text");
  const keep = screen.getByRole("button", { name: "Keep my version" });
  keep.focus();
  await act(() => userEvent.keyboard("{Enter}"));
  await waitFor(() =>
    expect(screen.queryByTestId("spectrolite-suggestion-card")).toBeNull(),
  );
  expect(resolveSuggestion).toHaveBeenLastCalledWith("suggestion", null);
  expect(document.activeElement).toBe(screen.getByRole("textbox"));
  expect(screen.getByRole("textbox").textContent).toBe("My newest text");
});
