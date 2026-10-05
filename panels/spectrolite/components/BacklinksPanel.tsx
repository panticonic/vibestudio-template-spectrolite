/**
 * Backlinks panel — lists every note that has a wikilink pointing at the
 * active file.
 *
 * Computed on demand by reading each `.mdx` and matching the active file's
 * basename (or path) inside `[[…]]`. GAD-native: the panel reads through
 * `vcs.readFile` at the vault's exact working state, mapping vault-relative
 * paths to VCS paths.
 * The core scan (`findBacklinks`) takes an injected reader so it stays a pure,
 * fs-free, unit-testable function. Scans are bounded + concurrent so large
 * vaults don't serialize thousands of reads onto the UI update path.
 */

import { useCallback } from "react";
import { useAsyncResource } from "@workspace/about-shared/asyncState";
import { Box, Flex, ScrollArea, Text } from "@radix-ui/themes";
import { Link2Icon } from "@radix-ui/react-icons";
import { blobstore } from "@workspace/runtime";
import { findBacklinks, type BacklinkReader } from "../state/backlinks";
import { useApp, useAppState } from "../app/context";

function basenameNoExt(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.mdx$/, "");
}

export function BacklinksPanel({ onOpened }: { onOpened?: () => void }) {
  const root = useAppState((s) => s.repoRoot);
  const activePath = useAppState((s) => s.activePath);
  if (root === null || !activePath) {
    return (
      <Text
        size="1"
        color="gray"
        as="div"
        style={{ padding: "var(--space-3)" }}
      >
        Open a file to see its backlinks.
      </Text>
    );
  }

  return (
    <BacklinksForNote
      key={JSON.stringify([root, activePath])}
      root={root}
      activePath={activePath}
      onOpened={onOpened}
    />
  );
}

/** A new note owns a new result; rescans of the same note retain its content. */
function BacklinksForNote({
  root,
  activePath,
  onOpened,
}: {
  root: string;
  activePath: string;
  onOpened?: () => void;
}) {
  const app = useApp();
  const paths = useAppState((s) => s.paths);
  const pathContentHashes = useAppState((s) => s.pathContentHashes);
  const scan = useCallback(async () => {
    const mapping = app.vault.mapping();
    const readFile: BacklinkReader = async (relPath) => {
      const digest = pathContentHashes[relPath];
      if (digest) {
        const text = await blobstore.getText(digest).catch(() => null);
        if (text !== null) return text;
      }
      const file = await app.semanticVcs
        ?.readFile(mapping.toVcsPath(relPath))
        .catch(() => null);
      return file && file.content.kind === "text" ? file.content.text : null;
    };
    return findBacklinks(root, activePath, paths, {
      concurrency: 96,
      readFile,
    });
  }, [app, root, activePath, paths, pathContentHashes]);
  const { data, loading, error } = useAsyncResource(scan);
  const backlinks = data ?? [];

  return (
    <Flex
      direction="column"
      gap="1"
      p="2"
      style={{ height: "100%", minHeight: 0 }}
      data-testid="spectrolite-backlinks"
    >
      <Flex align="center" gap="1" px="1">
        <Link2Icon />
        <Text
          size="1"
          weight="bold"
          color="gray"
          style={{ letterSpacing: "0.06em" }}
        >
          BACKLINKS
        </Text>
        <Text size="1" color="gray">
          · {backlinks.length}
        </Text>
      </Flex>
      <Box style={{ flex: 1, minHeight: 0 }}>
        <ScrollArea>
          {error ? (
            <Text size="1" color="red" role="alert">
              {error}
            </Text>
          ) : null}
          {loading ? (
            <Text
              size="1"
              color="gray"
              as="div"
              style={{ padding: "var(--space-2)" }}
            >
              Scanning…
            </Text>
          ) : data === undefined ? null : backlinks.length === 0 ? (
            <Text
              size="1"
              color="gray"
              as="div"
              style={{ padding: "var(--space-2)" }}
            >
              Nothing links here yet. Reference this note with [[
              {basenameNoExt(activePath)}]].
            </Text>
          ) : (
            <Flex direction="column" gap="1">
              {backlinks.map((bl) => (
                <button
                  key={bl.fromPath}
                  type="button"
                  className="spectrolite-backlink-row"
                  data-testid={`spectrolite-backlink-${bl.fromPath}`}
                  onClick={() => {
                    void app
                      .openFile(bl.fromPath)
                      .then(() => onOpened?.())
                      .catch(() => undefined);
                  }}
                >
                  <span className="spectrolite-file-row-name">
                    {bl.fromPath}
                  </span>
                  {bl.snippet ? (
                    <span className="spectrolite-backlink-snippet">
                      {bl.snippet}
                    </span>
                  ) : null}
                </button>
              ))}
            </Flex>
          )}
        </ScrollArea>
      </Box>
    </Flex>
  );
}
