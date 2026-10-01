/**
 * SuggestionCard — the live same-block collision resolver.
 *
 * When the scribe edits a block the user is actively typing in, the change is
 * NOT applied over theirs; the {@link DocController} surfaces a {@link Collision}
 * and the user picks accept (take the scribe's text), keep mine (discard the
 * suggestion), or merge (both, for the user to reconcile). The chosen text is
 * applied to the live block as a normal edit (and then committed).
 *
 * Uses `computeBlockDiff` / `resolveSuggestion` for a small inline word-diff.
 * Rendered as a quiet overlay stack so it never yanks the
 * editor; dismissing leaves the user's text + caret intact.
 */

import { OperationNotice } from "@workspace/ui/feedback";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Card, Flex, Text } from "@radix-ui/themes";
import { CheckIcon, Cross2Icon, MixIcon } from "@radix-ui/react-icons";
import { computeBlockDiff } from "../coedit/blockDiff";
import type { Collision } from "../coedit/blockReconcile";
import { useApp, useAppState } from "../app/context";
import type { SuggestionResolution } from "../app/createApp";

function userText(collision: Collision): string {
  return collision.oldTexts.join("\n\n");
}

function scribeText(collision: Collision): string {
  return collision.newTexts.join("\n\n");
}

function DiffView({ collision }: { collision: Collision }) {
  const segments = useMemo(
    () => computeBlockDiff(userText(collision), scribeText(collision)),
    [collision],
  );
  return (
    <Box
      className="spectrolite-suggestion-diff"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--font-size-1)",
        lineHeight: 1.5,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 160,
        overflow: "auto",
        padding: "var(--space-2)",
        borderRadius: "var(--radius-2)",
        background: "var(--gray-2)",
      }}
    >
      {segments.map((seg, i) => (
        <span
          key={i}
          style={
            seg.type === "insert"
              ? { background: "var(--grass-4)", color: "var(--grass-11)" }
              : seg.type === "delete"
                ? {
                    background: "var(--red-4)",
                    color: "var(--red-11)",
                    textDecoration: "line-through",
                  }
                : undefined
          }
        >
          {seg.value}
        </span>
      ))}
    </Box>
  );
}

function SuggestionRow({
  id,
  collision,
  onResolved,
}: {
  id: string;
  collision: Collision;
  onResolved: (id: string) => void;
}) {
  const app = useApp();
  const [error, setError] = useState<string | null>(null);

  const resolve = (choice: "accept" | "keep" | "merge") => {
    // Keeping mine dismisses the incoming proposal without replaying an old
    // snapshot over whatever the user has typed since the collision.

    // The live blocks are `liveIds`; anchor the replacement before the first
    // block after the run (the next live id is its own anchor on removal).
    const resolution: SuggestionResolution = {
      oldIds: collision.oldIds,
      beforeId: collision.oldIds[0] ?? null,
      choice: choice === "merge" ? "merge" : "accept",
      incomingText: scribeText(collision),
    };
    try {
      app.resolveSuggestion(id, choice === "keep" ? null : resolution);
      onResolved(id);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Card
      size="1"
      data-testid="spectrolite-suggestion-card"
      className="spectrolite-suggestion-card"
    >
      <Flex direction="column" gap="2">
        <Flex align="center" justify="between" gap="2">
          <Text size="1" weight="medium" color="iris">
            Incoming change overlaps your edit
          </Text>
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={() => resolve("keep")}
            aria-label="Keep my version"
            data-testid="spectrolite-suggestion-keep"
          >
            <Cross2Icon /> Keep mine
          </Button>
        </Flex>
        <DiffView collision={collision} />
        {error ? (
          <OperationNotice intent="error">{error}</OperationNotice>
        ) : null}
        <Flex gap="2">
          <Button
            size="1"
            variant="solid"
            color="iris"
            onClick={() => resolve("accept")}
            data-testid="spectrolite-suggestion-accept"
          >
            <CheckIcon /> Accept
          </Button>
          <Button
            size="1"
            variant="soft"
            color="gray"
            onClick={() => resolve("merge")}
            data-testid="spectrolite-suggestion-merge"
          >
            <MixIcon /> Merge both
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

export function SuggestionStack() {
  const suggestions = useAppState((s) => s.pendingSuggestions);
  const activePath = useAppState((s) => s.activePath);
  const app = useApp();
  const activeVcsPath = activePath
    ? app.vault.mapping().toVcsPath(activePath)
    : null;
  const visible = suggestions.filter((s) => s.vcsPath === activeVcsPath);
  const stack = useRef<HTMLDivElement>(null);
  const resolvedFocus = useRef<{
    id: string;
    editor: HTMLElement | null;
  } | null>(null);
  useLayoutEffect(() => {
    const pending = resolvedFocus.current;
    if (!pending || visible.some((s) => s.id === pending.id)) return;
    resolvedFocus.current = null;
    // Only repair focus lost when an explicitly resolved card was removed.
    if (document.activeElement !== document.body) return;
    const next = stack.current?.querySelector<HTMLButtonElement>("button");
    if (next) next.focus();
    else if (pending.editor?.isConnected) pending.editor.focus();
  }, [visible]);
  const onResolved = (id: string) => {
    if (!stack.current?.contains(document.activeElement)) return;
    resolvedFocus.current = {
      id,
      editor:
        stack.current.parentElement?.querySelector<HTMLElement>(
          '[contenteditable="true"]',
        ) ?? null,
    };
  };
  if (visible.length === 0) return null;
  return (
    <Box
      ref={stack}
      className="spectrolite-suggestion-stack"
      data-testid="spectrolite-suggestion-stack"
      style={{
        position: "absolute",
        right: "var(--space-3)",
        bottom: "var(--space-3)",
        width: "min(92vw, 360px)",
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        pointerEvents: "auto",
      }}
    >
      {visible.map((s) => (
        <SuggestionRow
          key={s.id}
          id={s.id}
          collision={s.collision}
          onResolved={onResolved}
        />
      ))}
    </Box>
  );
}
