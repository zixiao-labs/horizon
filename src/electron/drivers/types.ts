import type {
  ActorId,
  AdvanceOutcome,
  DriverBatch,
  DriverId,
  IdentityId,
  RunId,
  ThreadId,
  ThreadReplica,
  TimelineId,
  Version,
} from "../../shared/thread";

export interface ThreadAdvancePort {
  currentVersion(timelineId: TimelineId): Version;
  advance(batch: DriverBatch): Promise<AdvanceOutcome>;
}

export class ReplicaAdvancePort implements ThreadAdvancePort {
  readonly #replica: ThreadReplica;

  constructor(replica: ThreadReplica) {
    this.#replica = replica;
  }

  currentVersion(timelineId: TimelineId): Version {
    return this.#replica.currentVersion(timelineId);
  }

  async advance(batch: DriverBatch): Promise<AdvanceOutcome> {
    return this.#replica.advance(batch);
  }
}

export interface AgentDriverIdentity {
  readonly threadId: ThreadId;
  readonly timelineId: TimelineId;
  readonly driverId: DriverId;
  readonly actorId: ActorId;
  readonly identityId: IdentityId;
  readonly runId: RunId;
  readonly parentRunId?: RunId;
}

export interface AgentDriver extends AgentDriverIdentity {
  prompt(prompt: string): Promise<void>;
  steer(prompt: string): void;
  followUp(prompt: string): void;
  abort(): Promise<void>;
  dispose(): Promise<void>;
}

export interface AgentDriverFactory {
  create(identity: AgentDriverIdentity): AgentDriver;
}
