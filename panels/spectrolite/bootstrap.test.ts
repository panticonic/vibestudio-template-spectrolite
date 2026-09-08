import { describe, expect, it, vi } from "vitest";
import { getChannelDOParticipants } from "./bootstrap";

vi.mock("@workspace/runtime", () => ({ rpc: { call: vi.fn() } }));
vi.mock("@workspace/agentic-core", () => ({
  launchAgentIntoChannel: vi.fn(),
  retireAgentEntity: vi.fn(),
  unsubscribeAgentFromChannel: vi.fn(),
}));

describe("Spectrolite channel bootstrap", () => {
  it("reads participants through the connected channel client", async () => {
    const getParticipants = vi.fn(async () => [
      {
        participantId: "do:workers/silent-agent-worker:SilentAgentWorker:scribe",
        metadata: { handle: "scribe" },
      },
      { participantId: "panel:slot", metadata: { handle: "spectrolite" } },
    ]);

    await expect(getChannelDOParticipants({ getParticipants })).resolves.toEqual([
      {
        source: "workers/silent-agent-worker",
        className: "SilentAgentWorker",
        objectKey: "scribe",
      },
    ]);
    expect(getParticipants).toHaveBeenCalledOnce();
  });
});
