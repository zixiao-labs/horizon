import type {
  AdvanceOutcome,
  DriverBatch,
  RemoteAdvance,
  ThreadReplica,
} from "../../shared/thread";
import type { LocalThreadStore } from "../local-store";

export interface CollabTransport {
  connect(): Promise<void>;
  onRemoteAdvance(listener: (update: RemoteAdvance) => void): () => void;
  advance(batch: DriverBatch, requestId?: string): Promise<AdvanceOutcome>;
  close(): Promise<void>;
}

/**
 * Drives collaboration projection and transport. It is intentionally not an
 * AgentDriver and cannot be registered with AgentOrchestrator.
 */
export class CollabDriver {
  readonly #thread: ThreadReplica;
  readonly #transport: CollabTransport;
  readonly #store?: LocalThreadStore;
  #unsubscribe?: () => void;
  #unsubscribeLocal?: () => void;
  #flushing?: Promise<void>;
  #syncError?: unknown;

  constructor(thread: ThreadReplica, transport: CollabTransport, store?: LocalThreadStore) {
    this.#thread = thread;
    this.#transport = transport;
    this.#store = store;
  }

  async start(): Promise<void> {
    if (this.#unsubscribe) {
      return;
    }
    this.#unsubscribe = this.#transport.onRemoteAdvance((update) => {
      if (this.#store) this.#store.receive(this.#thread.threadId, update);
      else this.#thread.applyRemote(update);
    });
    try {
      await this.#transport.connect();
      this.#unsubscribeLocal = this.#store?.onAppend((batch) => {
        if (batch.thread_id === this.#thread.threadId) {
          void this.flush().catch((error: unknown) => {
            this.#syncError = error;
          });
        }
      });
      await this.flush();
    } catch (error) {
      this.#unsubscribe?.();
      this.#unsubscribe = undefined;
      this.#unsubscribeLocal?.();
      this.#unsubscribeLocal = undefined;
      await this.#transport.close();
      throw error;
    }
  }

  async advance(batch: DriverBatch): Promise<AdvanceOutcome> {
    if (batch.driver_kind !== "collab") {
      throw new Error("CollabDriver may only originate collab batches");
    }
    if (this.#store) {
      const local = this.#store.append(batch, crypto.randomUUID());
      // Local commit succeeds offline; callers explicitly flush when connected.
      return local;
    }
    const local = this.#thread.advance(batch);
    const remote = await this.#transport.advance(batch);
    return {
      accepted: local.accepted,
      frontier: remote.frontier,
    };
  }

  /** Forwards durable batches from either Driver without changing provenance. */
  flush(): Promise<void> {
    if (this.#flushing) return this.#flushing;
    this.#flushing = (async () => {
      this.#syncError = undefined;
      while (this.#store) {
        const pending = this.#store.pending(this.#thread.threadId);
        if (!pending.length) break;
        for (const { requestId, batch } of pending) {
          await this.#transport.advance(batch, requestId);
          this.#store.acknowledge(this.#thread.threadId, requestId);
        }
      }
    })().finally(() => {
      this.#flushing = undefined;
    });
    return this.#flushing;
  }

  get syncError(): unknown {
    return this.#syncError;
  }

  async stop(): Promise<void> {
    this.#unsubscribeLocal?.();
    this.#unsubscribeLocal = undefined;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    await this.#transport.close();
  }
}
