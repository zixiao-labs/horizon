import { describe, expect, it } from "@lightning-js/lightning";
import { AgentOrchestrator } from "./agent-orchestrator";
import type { AgentDriver, AgentDriverFactory, AgentDriverIdentity } from "./types";

class FakeAgentDriver implements AgentDriver {
  readonly prompts: string[] = [];
  readonly threadId;
  readonly timelineId;
  readonly driverId;
  readonly actorId;
  readonly identityId;
  readonly runId;
  readonly parentRunId;

  constructor(identity: AgentDriverIdentity) {
    this.threadId = identity.threadId;
    this.timelineId = identity.timelineId;
    this.driverId = identity.driverId;
    this.actorId = identity.actorId;
    this.identityId = identity.identityId;
    this.runId = identity.runId;
    this.parentRunId = identity.parentRunId;
  }

  async prompt(prompt: string): Promise<void> {
    this.prompts.push(prompt);
  }

  steer(prompt: string): void {
    this.prompts.push(`steer:${prompt}`);
  }

  followUp(prompt: string): void {
    this.prompts.push(`follow-up:${prompt}`);
  }

  async abort(): Promise<void> {}
  async dispose(): Promise<void> {}
}

class FakeAgentDriverFactory implements AgentDriverFactory {
  readonly created: FakeAgentDriver[] = [];

  create(identity: AgentDriverIdentity): AgentDriver {
    const driver = new FakeAgentDriver(identity);
    this.created.push(driver);
    return driver;
  }
}

const identity = (runId: string): AgentDriverIdentity => ({
  threadId: "thread",
  timelineId: `timeline-${runId}`,
  driverId: `driver-${runId}`,
  actorId: `actor-${runId}`,
  identityId: "identity",
  runId,
});

describe("AgentOrchestrator", () => {
  it("composes AgentDrivers and records explicit fork ancestry", async () => {
    const factory = new FakeAgentDriverFactory();
    const orchestrator = new AgentOrchestrator(factory);
    const parent = orchestrator.launch(identity("parent"), "start");
    await parent.completion;
    const child = orchestrator.fork("parent", identity("child"), "inspect");
    await child.completion;

    expect(factory.created[0]?.prompts).toEqual(["start"]);
    expect(factory.created[1]?.parentRunId).toBe("parent");
    expect(factory.created[1]?.prompts).toEqual(["inspect"]);
  });
});
