import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelDORef } from "../bootstrap";
import { createStore } from "./store";
import { initialState } from "./state";
import { SessionController } from "./sessionController";

const pubsubMocks = vi.hoisted(() => {
  let closeStream: (() => void) | undefined;
  const client = {
    getParticipants: vi.fn(async () => []),
    ready: vi.fn<() => Promise<void>>(async () => undefined),
    onRoster: vi.fn(() => () => {}),
    events: vi.fn(async function* () {
      await new Promise<void>((resolve) => {
        closeStream = resolve;
      });
    }),
    close: vi.fn(() => closeStream?.()),
    roster: {},
  };
  return {
    client,
    connectViaRpc: vi.fn(() => client),
  };
});

const bootstrapMocks = vi.hoisted(() => ({
  createAndSubscribeAgent: vi.fn<
    (
      input: Record<string, unknown>,
    ) => Promise<{ entityId?: string; participantId?: string }>
  >(async () => ({})),
  getChannelDOParticipants: vi.fn<
    (channel: typeof pubsubMocks.client) => Promise<ChannelDORef[]>
  >(async () => []),
  listAvailableAgents: vi.fn(async () => []),
  newAgentKey: vi.fn((handle: string) => `agent:${handle}`),
  newChannelName: vi.fn(() => "new-channel"),
  unsubscribeDOFromChannel: vi.fn(),
}));

vi.mock("@workspace/pubsub", () => ({
  connectViaRpc: pubsubMocks.connectViaRpc,
}));

vi.mock("@workspace/runtime", () => ({
  rpc: {},
  panel: {
    slotId: "panel:slot-test",
    stateArgs: { set: vi.fn() },
  },
}));
vi.mock("@workspace/runtime/internal/diagnostics", () => ({
  recoveryCoordinator: {},
}));

vi.mock("../messages/register", () => ({
  registerSpectroliteMessageTypes: vi.fn(async () => undefined),
}));

vi.mock("../bootstrap", () => ({
  createAndSubscribeAgent: bootstrapMocks.createAndSubscribeAgent,
  getChannelDOParticipants: bootstrapMocks.getChannelDOParticipants,
  listAvailableAgents: bootstrapMocks.listAvailableAgents,
  newAgentKey: bootstrapMocks.newAgentKey,
  newChannelName: bootstrapMocks.newChannelName,
  unsubscribeDOFromChannel: bootstrapMocks.unsubscribeDOFromChannel,
}));

describe("SessionController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bootstrapMocks.getChannelDOParticipants.mockResolvedValue([]);
    bootstrapMocks.createAndSubscribeAgent.mockResolvedValue({});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("refreshes the exact owned subscriptions after channel readiness", async () => {
    const store = createStore(
      initialState({
        contextId: "ctx",
        channelName: "chan",
        repoRoot: "projects/default",
        openPath: null,
        installedAgents: [
          {
            agentId: "SilentAgentWorker",
            handle: "scribe",
            key: "agent:scribe",
            source: "workers/silent-agent-worker",
            className: "SilentAgentWorker",
          },
        ],
      }),
    );

    await new SessionController(store).start();

    expect(bootstrapMocks.createAndSubscribeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "agent:scribe",
        channelId: "chan",
        channelContextId: "ctx",
      }),
    );
    expect(store.getState()).toMatchObject({
      connectionStatus: "ready",
      agentsStatus: "ready",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("rehydrates persisted agents after selecting a vault from the picker", async () => {
    const store = createStore(
      initialState({
        contextId: "ctx",
        channelName: "chan",
        repoRoot: null,
        openPath: null,
        installedAgents: [
          {
            agentId: "SilentAgentWorker",
            handle: "scribe",
            key: "agent:scribe",
            source: "workers/silent-agent-worker",
            className: "SilentAgentWorker",
          },
        ],
      }),
    );
    const session = new SessionController(store);

    await session.start();
    expect(pubsubMocks.connectViaRpc).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "panel:slot-test",
      }),
    );
    expect(bootstrapMocks.createAndSubscribeAgent).not.toHaveBeenCalled();

    store.setState({ repoRoot: "/projects/default" });
    session.onVaultSelected("/projects/default");
    await vi.waitFor(() => {
      expect(bootstrapMocks.createAndSubscribeAgent).toHaveBeenCalledTimes(1);
    });
    expect(bootstrapMocks.createAndSubscribeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "agent:scribe",
        channelId: "chan",
        channelContextId: "ctx",
        replay: true,
      }),
    );
  });

  it("retains a failed assistant's identity and retries only on an explicit recovery action", async () => {
    vi.useFakeTimers();
    const store = createStore(
      initialState({
        contextId: "ctx",
        channelName: "chan",
        repoRoot: "/projects/default",
        openPath: null,
        installedAgents: [
          {
            agentId: "SilentAgentWorker",
            handle: "scribe",
            key: "agent:scribe",
            source: "workers/silent-agent-worker",
            className: "SilentAgentWorker",
          },
        ],
      }),
    );
    bootstrapMocks.createAndSubscribeAgent
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({});
    const session = new SessionController(store);

    await session.start();
    expect(bootstrapMocks.createAndSubscribeAgent).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({
      connectionStatus: "ready",
      agentsStatus: "error",
      agentsError: "transient",
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(bootstrapMocks.createAndSubscribeAgent).toHaveBeenCalledTimes(1);
    await session.retryAgents();
    expect(bootstrapMocks.createAndSubscribeAgent).toHaveBeenCalledTimes(2);
    expect(
      bootstrapMocks.createAndSubscribeAgent.mock.calls[1]?.[0],
    ).toMatchObject({ key: "agent:scribe" });
    expect(store.getState().agentsStatus).toBe("ready");
  });

  it("updates stable agents' repository focus without changing context", async () => {
    const store = createStore(
      initialState({
        contextId: "ctx-panel",
        channelName: "chan",
        repoRoot: "projects/default",
        openPath: null,
        installedAgents: [
          {
            agentId: "SilentAgentWorker",
            handle: "scribe",
            key: "agent:scribe",
            source: "workers/silent-agent-worker",
            className: "SilentAgentWorker",
          },
        ],
      }),
    );
    bootstrapMocks.getChannelDOParticipants.mockResolvedValue([
      {
        source: "workers/silent-agent-worker",
        className: "SilentAgentWorker",
        objectKey: "agent:scribe",
      },
    ]);
    const session = new SessionController(store);
    await session.start();
    expect(bootstrapMocks.createAndSubscribeAgent).toHaveBeenCalledTimes(1);

    store.setState({ repoRoot: "projects/second" });
    session.onVaultSelected("projects/second");

    await vi.waitFor(() =>
      expect(bootstrapMocks.createAndSubscribeAgent).toHaveBeenCalledTimes(2),
    );
    expect(bootstrapMocks.createAndSubscribeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        channelContextId: "ctx-panel",
        channelId: "chan",
        key: "agent:scribe",
        config: expect.objectContaining({
          systemPrompt: expect.stringContaining("projects/second"),
        }),
      }),
    );
  });

  it("retires the exact launched entity when removing an agent", async () => {
    const store = createStore(
      initialState({
        contextId: "ctx",
        channelName: "chan",
        repoRoot: "/projects/default",
        openPath: null,
        installedAgents: [
          {
            agentId: "TestAgentWorker",
            entityId: "entity:test-agent",
            handle: "test-agent",
            key: "agent:test-agent",
            source: "workers/test-agent-worker",
            className: "TestAgentWorker",
          },
        ],
      }),
    );

    const session = new SessionController(store);
    await session.start();
    await session.removeAgent("test-agent");

    expect(bootstrapMocks.unsubscribeDOFromChannel).toHaveBeenCalledWith(
      "workers/test-agent-worker",
      "TestAgentWorker",
      "agent:test-agent",
      "chan",
      "entity:test-agent",
    );
    expect(store.getState().installedAgents).toEqual([]);
  });
  it("does not expose readiness or launch assistants before the channel is ready", async () => {
    let resolve!: () => void;
    pubsubMocks.client.ready.mockImplementationOnce(
      () =>
        new Promise<void>((ready) => {
          resolve = ready;
        }),
    );
    const store = createStore(
      initialState({
        contextId: "ctx",
        channelName: "chan",
        repoRoot: "projects/default",
        openPath: null,
      }),
    );
    const session = new SessionController(store);
    const starting = session.start();
    expect(store.getState().connectionStatus).toBe("connecting");
    expect(bootstrapMocks.createAndSubscribeAgent).not.toHaveBeenCalled();
    resolve();
    await starting;
    expect(store.getState().connectionStatus).toBe("ready");
    expect(bootstrapMocks.createAndSubscribeAgent).toHaveBeenCalledTimes(1);
    session.dispose();
  });
  it("surfaces a failed channel readiness check and reconnects with its retained channel identity", async () => {
    pubsubMocks.client.ready.mockRejectedValueOnce(
      new Error("Provider disconnected"),
    );
    const store = createStore(
      initialState({
        contextId: "ctx",
        channelName: "chan",
        repoRoot: null,
        openPath: null,
        installedAgents: [],
      }),
    );
    const session = new SessionController(store);
    await session.start();
    expect(store.getState()).toMatchObject({
      client: null,
      connectionStatus: "error",
      connectionError: "Provider disconnected",
    });
    expect(pubsubMocks.client.close).toHaveBeenCalled();
    await session.start();
    expect(pubsubMocks.connectViaRpc).toHaveBeenLastCalledWith(
      expect.objectContaining({ channel: "chan" }),
    );
    expect(store.getState().connectionStatus).toBe("ready");
    session.dispose();
  });

  it("serializes concurrent additions without losing either owned assistant", async () => {
    const store = createStore(
      initialState({
        contextId: "ctx",
        channelName: "chan",
        repoRoot: "/projects/default",
        openPath: null,
        installedAgents: [],
      }),
    );
    const session = new SessionController(store);
    await session.start();
    store.setState({
      availableAgents: [
        {
          id: "workers/test-agent-worker",
          className: "TestAgentWorker",
          name: "Test agent",
          proposedHandle: "helper",
        },
      ],
    });
    await Promise.all([
      session.addAgent("workers/test-agent-worker"),
      session.addAgent("workers/test-agent-worker"),
    ]);
    expect(store.getState().installedAgents).toHaveLength(2);
    expect(
      new Set(store.getState().installedAgents?.map((agent) => agent.key)).size,
    ).toBe(2);
    session.dispose();
  });

  it("keeps an assistant owned when retirement fails, then preserves an explicit empty selection", async () => {
    const agent = {
      agentId: "TestAgentWorker",
      handle: "helper",
      key: "agent:helper",
      source: "workers/test-agent-worker",
      className: "TestAgentWorker",
      entityId: "entity:helper",
    };
    const store = createStore(
      initialState({
        contextId: "ctx",
        channelName: "chan",
        repoRoot: "/projects/default",
        openPath: null,
        installedAgents: [agent],
      }),
    );
    const session = new SessionController(store);
    await session.start();
    bootstrapMocks.unsubscribeDOFromChannel.mockRejectedValueOnce(
      new Error("Retirement denied"),
    );
    await expect(session.removeAgent("helper")).rejects.toThrow(
      "Retirement denied",
    );
    expect(store.getState().installedAgents).toEqual([agent]);
    expect(store.getState().removedHandles).toEqual([]);
    await session.removeAgent("helper");
    await session.retryAgents();
    expect(store.getState().installedAgents).toEqual([]);
    expect(bootstrapMocks.createAndSubscribeAgent).toHaveBeenCalledTimes(1);
    session.dispose();
  });
});
