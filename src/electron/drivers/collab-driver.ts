import type {
  AdvanceOutcome,
  DriverBatch,
  RemoteAdvance,
  ThreadReplica,
} from "../../shared/thread";

export interface CollabTransport {
  connect(): Promise<void>;
  onRemoteAdvance(listener: (update: RemoteAdvance) => void): () => void;
  advance(batch: DriverBatch): Promise<AdvanceOutcome>;
  close(): Promise<void>;
}

/**
 * Drives collaboration projection and transport. It is intentionally not an
 * AgentDriver and cannot be registered with AgentOrchestrator.
 */
export class CollabDriver {
  readonly #thread: ThreadReplica;
  readonly #transport: CollabTransport;
  #unsubscribe?: () => void;

  constructor(thread: ThreadReplica, transport: CollabTransport) {
    this.#thread = thread;
    this.#transport = transport;
  }

  async start(): Promise<void> {
    if (this.#unsubscribe) {
      return;
    }
    this.#unsubscribe = this.#transport.onRemoteAdvance((update) => {
      this.#thread.applyRemote(update);
    });
    await this.#transport.connect();
  }

  async advance(batch: DriverBatch): Promise<AdvanceOutcome> {
    if (batch.driver_kind !== "collab") {
      throw new Error("CollabDriver may only originate collab batches");
    }
    const local = this.#thread.advance(batch);
    const remote = await this.#transport.advance(batch);
    return {
      accepted: local.accepted,
      frontier: remote.frontier,
    };
  }

  async stop(): Promise<void> {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    await this.#transport.close();
  }
}
