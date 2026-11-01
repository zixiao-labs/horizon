import { describe, expect, it } from "@lightning-js/lightning";
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import { ThreadReplica } from "../../shared/thread";
import { PiAgentDriver } from "./pi-agent-driver";
import { ReplicaAdvancePort } from "./types";

class FakePiAgent {
  #listener?: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void;

  subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void) {
    this.#listener = listener;
    return () => {
      this.#listener = undefined;
    };
  }

  async prompt(): Promise<void> {
    const signal = new AbortController().signal;
    const user: AgentMessage = { role: "user", content: "hello", timestamp: 1 };
    await this.#listener?.({ type: "agent_start" }, signal);
    await this.#listener?.({ type: "message_start", message: user }, signal);
    await this.#listener?.({ type: "message_end", message: user }, signal);
    await this.#listener?.({ type: "agent_end", messages: [user] }, signal);
  }

  steer(): void {}
  followUp(): void {}
  abort(): void {}
  async waitForIdle(): Promise<void> {}
}

describe("PiAgentDriver", () => {
  it("advances a passive thread from awaited Pi lifecycle events", async () => {
    const thread = new ThreadReplica("thread");
    const driver = new PiAgentDriver(
      {
        threadId: "thread",
        timelineId: "timeline",
        driverId: "driver",
        actorId: "actor",
        identityId: "identity",
        runId: "run",
      },
      new FakePiAgent() as never,
      new ReplicaAdvancePort(thread),
    );

    await driver.prompt("hello");

    expect(thread.graph.size).toBe(4);
    expect(thread.currentVersion("timeline")).toEqual([{ actor: "actor", sequence: 4 }]);
    await driver.dispose();
  });
});
