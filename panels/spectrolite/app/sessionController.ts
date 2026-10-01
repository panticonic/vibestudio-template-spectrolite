/**
 * Session controller — channel lifecycle + resident-agent management.
 *
 * Replaces the three racing useEffect chains that previously lived in
 * index.tsx (bootstrap / default agent / rehydrate) with one sequential,
 * idempotent `start()` flow:
 *
 *   1. ensure a channel name exists (mint + persist on first run)
 *   2. connect the PubSub client
 *   3. register Spectrolite's custom message types
 *   4. subscribe roster + consume the event stream into the store
 *   5. if a vault is already selected: bootstrap the default agent
 *      (fresh channel) or rehydrate persisted agents (host restart)
 *
 * Vault selection later calls `onVaultSelected()`, which runs step 5 and
 * updates resident-agent subscriptions to the new repository without moving
 * either the panel or agents to another workspace context.
 */

import { connectViaRpc, type PubSubClient } from "@workspace/pubsub";
import { rpc, panel } from "@workspace/runtime";
import { recoveryCoordinator } from "@workspace/runtime/internal/diagnostics";
import type { ChatParticipantMetadata } from "@workspace/agentic-core";
import type { Store } from "./store";
import type { ChannelMessage, RosterAgent, SpectroliteState } from "./state";
import {
  createAndSubscribeAgent,
  listAvailableAgents,
  newAgentKey,
  newChannelName,
  unsubscribeDOFromChannel,
  type InstalledAgentRecord,
} from "../bootstrap";
import { registerSpectroliteMessageTypes } from "../messages/register";
import { spectroliteAgentSystemPrompt } from "../agent-prompt";

// The silent agent worker is the default companion: it only sends a chat
// message when it explicitly calls its `say` tool, so the channel stays
// quiet during routine file edits.
const DEFAULT_WORKER_SOURCE = "workers/silent-agent-worker";
const DEFAULT_CLASS_NAME = "SilentAgentWorker";
const DEFAULT_HANDLE = "scribe";

const MAX_MESSAGES = 50;

/** Spectrolite's own participant handle on the channel. */
export const PANEL_HANDLE = "spectrolite";

const PANEL_METADATA = {
  name: "Spectrolite",
  type: "panel" as const,
  handle: PANEL_HANDLE,
};

function buildAgentConfig(opts: {
  handle: string;
  repoRoot: string | null;
  className?: string;
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    handle: opts.handle,
    systemPrompt: spectroliteAgentSystemPrompt({
      workspaceRoot: opts.repoRoot ?? "/projects/<not-selected-yet>",
      handle: opts.handle,
    }),
    systemPromptMode: "append",
    // Only exact participant addressing wakes a resident editor. This keeps a
    // multi-agent vault quiet and makes the Ask button deterministic.
    wakePolicy: "explicit",
  };
  if (opts.className === "TestAgentWorker") {
    return {
      ...base,
      deterministicResponse: true,
      writeVaultSwitchMarker: true,
      markerPath: "AgentProof.mdx",
      responseText: `Deterministic Spectrolite test agent @${opts.handle} handled the update.`,
      delayMs: 10,
    };
  }
  return base;
}

export class SessionController {
  private client: PubSubClient<ChatParticipantMetadata> | null = null;
  private disposed = false;
  private startup: Promise<void> | null = null;
  /** Vault the agents were last scoped to; null until the first selection is observed. */
  private agentRepositoryFocus: string | null = null;
  private agentOperations: Promise<void> = Promise.resolve();
  private unsubscribeRoster: (() => void) | null = null;

  constructor(private readonly store: Store<SpectroliteState>) {}

  async start(): Promise<void> {
    if (this.disposed || this.store.getState().connectionStatus === "ready")
      return;
    if (this.startup) return this.startup;
    const pending = this.startSession();
    this.startup = pending;
    try {
      await pending;
    } finally {
      if (this.startup === pending) this.startup = null;
    }
  }

  private async startSession(): Promise<void> {
    this.store.setState({
      connectionStatus: "connecting",
      connectionError: null,
      agentsStatus: "idle",
    });
    let client: PubSubClient<ChatParticipantMetadata> | null = null;
    try {
      const state = this.store.getState();
      if (!state.contextId)
        throw new Error("Spectrolite has no workspace context.");
      let channelName = state.channelName;
      if (!channelName) {
        channelName = newChannelName();
        await panel.stateArgs.set({
          channelName,
          repoRoot: state.repoRoot ?? undefined,
        });
        this.store.setState({ channelName });
      }
      client = connectViaRpc<ChatParticipantMetadata>({
        rpc,
        channel: channelName,
        contextId: state.contextId,
        clientId: panel.slotId,
        metadata: PANEL_METADATA,
        recoveryCoordinator,
      });
      this.client = client;
      this.store.setState({ client });
      await client.ready();
      if (this.disposed || this.client !== client) return;
      await registerSpectroliteMessageTypes(client);
      if (this.disposed || this.client !== client) return;
      this.unsubscribeRoster = client.onRoster(() => this.handleRosterUpdate());
      this.handleRosterUpdate();
      this.store.setState({ connectionStatus: "ready", connectionError: null });
      void this.consumeEvents(client);
      void this.refreshAvailableAgents();
      if (this.store.getState().repoRoot) await this.ensureAgents();
    } catch (error) {
      if (this.disposed || (client && this.client !== client)) return;
      this.unsubscribeRoster?.();
      this.unsubscribeRoster = null;
      client?.close();
      this.client = null;
      this.store.setState({
        client: null,
        connectionStatus: "error",
        connectionError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async refreshAvailableAgents(): Promise<void> {
    try {
      const agents = await listAvailableAgents();
      if (!this.disposed)
        this.store.setState({
          availableAgents: agents,
          availableAgentsError: null,
        });
    } catch (error) {
      if (!this.disposed)
        this.store.setState({
          availableAgentsError:
            error instanceof Error ? error.message : String(error),
        });
    }
  }

  async retryAgents(): Promise<void> {
    await this.ensureAgents();
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribeRoster?.();
    this.unsubscribeRoster = null;
    this.client?.close();
    this.client = null;
    this.store.setState({ client: null, connectionStatus: "closed" });
  }

  /**
   * Update the resident agents' repository focus inside the unchanged panel
   * context. This is prompt/UI focus, not an authorization scope: file access,
   * context, channel, and agent identities all remain unchanged.
   */
  onVaultSelected(_repoRoot: string): void {
    if (this.disposed || this.store.getState().connectionStatus !== "ready")
      return;
    void this.ensureAgents();
  }

  async send(
    content: string,
    options?: { mentions?: string[] },
  ): Promise<void> {
    const client = this.client;
    if (!client || this.store.getState().connectionStatus !== "ready")
      throw new Error("Channel not connected");
    await client.send(content, options);
  }

  openDock(): void {
    this.store.setState((prev) => ({
      dockOpenSignal: prev.dockOpenSignal + 1,
    }));
  }

  // ---- agent management ----

  addAgent(agentId: string): Promise<void> {
    return this.withAgents(() => this.addOwnedAgent(agentId));
  }

  private async addOwnedAgent(agentId: string): Promise<void> {
    const state = this.store.getState();
    const channelName = state.channelName;
    const contextId = state.contextId;
    if (!channelName || !contextId || state.connectionStatus !== "ready")
      throw new Error("Channel not connected");
    const agents =
      state.availableAgents.length > 0
        ? state.availableAgents
        : await listAvailableAgents();
    const agent = agents.find(
      (a) => a.id === agentId || a.className === agentId,
    );
    if (!agent)
      throw new Error(
        `Agent ${agentId} is unavailable. Refresh the agent list and try again.`,
      );
    const handle = `${agent.proposedHandle}-${crypto.randomUUID().slice(0, 4)}`;
    const key = newAgentKey(handle);
    // Persist the selected identity before launching. A rejected or ambiguous
    // launch remains recoverable through the same owned subscription.
    await this.persistInstalled([
      ...(this.store.getState().installedAgents ?? []),
      {
        agentId: agent.className,
        handle,
        key,
        source: agent.id,
        className: agent.className,
      },
    ]);
    this.store.setState({ agentsStatus: "idle" });
    await this.ensureOwnedAgents();
    const outcome = this.store.getState();
    if (outcome.agentsStatus === "error")
      throw new Error(outcome.agentsError ?? "Agent subscription failed");
  }

  removeAgent(handle: string): Promise<void> {
    return this.withAgents(async () => {
      const state = this.store.getState();
      if (!state.channelName || state.connectionStatus !== "ready")
        throw new Error("Channel not connected");
      const record = state.installedAgents?.find(
        (agent) => agent.handle === handle,
      );
      if (!record)
        throw new Error(`Assistant ${handle} is not owned by this panel.`);
      // The owned identity is authoritative even while roster delivery lags.
      // Forget it only after unsubscribe and retirement have both completed.
      await unsubscribeDOFromChannel(
        record.source,
        record.className,
        record.key,
        state.channelName,
        record.entityId,
      );
      await this.persistInstalled(
        (this.store.getState().installedAgents ?? []).filter(
          (agent) => agent.key !== record.key,
        ),
      );
      this.store.setState((prev) => ({
        removedHandles: [...prev.removedHandles, handle],
      }));
    });
  }

  // ---- internals ----

  private async persistInstalled(
    installed: InstalledAgentRecord[],
  ): Promise<void> {
    await panel.stateArgs.set({ installedAgents: installed });
    this.store.setState({ installedAgents: installed });
  }

  private withAgents<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.agentOperations.then(operation);
    this.agentOperations = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }

  /** All changes to installed subscriptions share one session owner. */
  private ensureAgents(): Promise<void> {
    return this.withAgents(() => this.ensureOwnedAgents());
  }

  private async ensureOwnedAgents(): Promise<void> {
    if (this.disposed || this.store.getState().connectionStatus !== "ready")
      return;
    const state = this.store.getState();
    if (!state.channelName || !state.contextId || !state.repoRoot) return;
    if (
      state.agentsStatus === "ready" &&
      this.agentRepositoryFocus === state.repoRoot
    )
      return;
    await this.subscribeOwnedAgents(
      state.channelName,
      state.contextId,
      state.repoRoot,
    );
  }

  private async subscribeOwnedAgents(
    channelName: string,
    contextId: string,
    repoRoot: string,
  ): Promise<void> {
    this.store.setState({ agentsStatus: "starting", agentsError: null });
    try {
      if (this.store.getState().installedAgents === null) {
        await this.persistInstalled([
          {
            agentId: DEFAULT_CLASS_NAME,
            handle: DEFAULT_HANDLE,
            key: newAgentKey(DEFAULT_HANDLE),
            source: DEFAULT_WORKER_SOURCE,
            className: DEFAULT_CLASS_NAME,
          },
        ]);
      }
      // Refresh the exact owned subscriptions. A roster entry alone does not
      // establish that its repository focus or configuration is current.
      for (const agent of this.store.getState().installedAgents ?? []) {
        const launched = await createAndSubscribeAgent({
          source: agent.source,
          className: agent.className,
          key: agent.key,
          channelId: channelName,
          channelContextId: contextId,
          config: buildAgentConfig({
            handle: agent.handle,
            repoRoot,
            className: agent.className,
          }),
          replay: true,
        });
        if (this.disposed) return;
        this.markAgentLive(agent.handle, launched.participantId);
        if (launched.entityId && launched.entityId !== agent.entityId)
          await this.persistInstalled(
            (this.store.getState().installedAgents ?? []).map((record) =>
              record.key === agent.key
                ? { ...record, entityId: launched.entityId }
                : record,
            ),
          );
      }
      if (!this.disposed) {
        this.agentRepositoryFocus = repoRoot;
        this.store.setState({ agentsStatus: "ready", agentsError: null });
      }
    } catch (error) {
      if (!this.disposed)
        this.store.setState({
          agentsStatus: "error",
          agentsError: error instanceof Error ? error.message : String(error),
        });
    }
  }

  private handleRosterUpdate(): void {
    const client = this.client;
    if (!client || this.disposed) return;
    const next: RosterAgent[] = [];
    for (const participant of Object.values(client.roster)) {
      const meta = participant.metadata as { handle?: string; type?: string };
      if (meta.type === "panel" || !meta.handle) continue;
      next.push({
        handle: meta.handle,
        participantId: participant.id,
        status: "live",
      });
    }
    this.store.setState((prev) => {
      const liveHandles = new Set(next.map((agent) => agent.handle));
      const removedHandles = prev.removedHandles.filter((handle) =>
        liveHandles.has(handle),
      );
      return {
        roster: next,
        removedHandles:
          removedHandles.length === prev.removedHandles.length
            ? prev.removedHandles
            : removedHandles,
      };
    });
  }

  private markAgentLive(handle: string, participantId?: string): void {
    this.store.setState((prev) => {
      const existing = prev.roster.find((agent) => agent.handle === handle);
      if (existing) {
        if (
          existing.status === "live" &&
          existing.participantId === participantId
        ) {
          return prev;
        }
        return {
          roster: prev.roster.map((agent) =>
            agent.handle === handle
              ? {
                  ...agent,
                  ...(participantId ? { participantId } : {}),
                  status: "live" as const,
                }
              : agent,
          ),
        };
      }
      return {
        roster: [
          ...prev.roster,
          {
            handle,
            ...(participantId ? { participantId } : {}),
            status: "live" as const,
          },
        ],
      };
    });
  }

  /** Stream completed chat messages into the store for the channel dock. */
  private async consumeEvents(
    client: PubSubClient<ChatParticipantMetadata>,
  ): Promise<void> {
    try {
      for await (const event of client.events({
        includeReplay: true,
        includeSignals: false,
      })) {
        if (this.disposed || this.client !== client) return;
        const wire = event as unknown as {
          type?: string;
          messageId?: string;
          senderId?: string;
          senderMetadata?: { handle?: string; name?: string; type?: string };
          ts?: number;
          payload?: { kind?: string; payload?: { content?: string } };
        };
        if (wire.type !== "agentic.trajectory.v1/event") continue;
        const evt = wire.payload;
        // Only completed messages — partial streaming chunks would flicker.
        if (!evt || evt.kind !== "message.completed") continue;
        const content = evt.payload?.content;
        if (typeof content !== "string" || !content) continue;
        const id =
          wire.messageId ?? `${wire.senderId ?? "?"}-${wire.ts ?? Date.now()}`;
        const message: ChannelMessage = {
          id,
          senderId: wire.senderId ?? "?",
          senderHandle: wire.senderMetadata?.handle,
          senderName: wire.senderMetadata?.name,
          senderType: wire.senderMetadata?.type,
          content,
          ts: wire.ts ?? Date.now(),
        };
        this.store.setState((prev) => {
          if (prev.messages.some((m) => m.id === id)) return {};
          return { messages: [...prev.messages, message].slice(-MAX_MESSAGES) };
        });
      }
      throw new Error(
        "The channel event stream has closed. Reconnect to resume collaboration.",
      );
    } catch (err) {
      if (!this.disposed && this.client === client) {
        this.unsubscribeRoster?.();
        this.unsubscribeRoster = null;
        client.close();
        this.client = null;
        this.store.setState({
          client: null,
          connectionStatus: "error",
          connectionError: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
