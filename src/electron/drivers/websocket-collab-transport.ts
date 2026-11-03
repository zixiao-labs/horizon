import {
  advanceOutcome,
  protocolVersion,
  type ClientMessage,
  type ServerMessage,
} from "../../shared/sync-protocol";
import type { AdvanceOutcome, DriverBatch, RemoteAdvance } from "../../shared/thread";
import type { Subscription } from "../../shared/sync-protocol";
import type { CollabTransport } from "./collab-driver";

export type WebSocketFactory = (url: string) => WebSocket;

export class WebSocketCollabTransport implements CollabTransport {
  readonly #url: string;
  readonly #subscriptions: readonly Subscription[] | (() => readonly Subscription[]);
  readonly #factory: WebSocketFactory;
  readonly #listeners = new Set<(update: RemoteAdvance) => void>();
  readonly #pending = new Map<
    string,
    {
      resolve: (outcome: AdvanceOutcome) => void;
      reject: (error: Error) => void;
    }
  >();
  #socket?: WebSocket;
  #connectPromise?: Promise<void>;

  constructor(
    url: string,
    subscriptions: readonly Subscription[] | (() => readonly Subscription[]),
    factory: WebSocketFactory = (address) => new WebSocket(address),
  ) {
    this.#url = url;
    this.#subscriptions = subscriptions;
    this.#factory = factory;
  }

  connect(): Promise<void> {
    if (this.#connectPromise) {
      return this.#connectPromise;
    }
    this.#connectPromise = new Promise<void>((resolve, reject) => {
      const socket = this.#factory(this.#url);
      this.#socket = socket;
      socket.addEventListener("open", () => {
        if (this.#socket !== socket) return;
        this.#send({
          type: "hello",
          data: {
            protocol_version: protocolVersion,
            subscriptions:
              typeof this.#subscriptions === "function"
                ? this.#subscriptions()
                : this.#subscriptions,
          },
        });
      });
      socket.addEventListener("message", (event) => {
        if (this.#socket !== socket) return;
        try {
          if (typeof event.data !== "string") {
            throw new Error("Horizon sync protocol only accepts text frames");
          }
          const message = JSON.parse(event.data) as ServerMessage;
          if (message.type === "ready") {
            if (message.data.protocol_version !== protocolVersion) {
              throw new Error(
                `Server protocol ${message.data.protocol_version} does not match ${protocolVersion}`,
              );
            }
            resolve();
            return;
          }
          this.#handle(message);
        } catch (error) {
          reject(error);
          this.#rejectPending(error instanceof Error ? error : new Error(String(error)));
          void this.close();
        }
      });
      socket.addEventListener("error", () => {
        if (this.#socket !== socket) return;
        const error = new Error("Horizon collaboration socket failed");
        reject(error);
        this.#rejectPending(error);
        void this.close();
      });
      socket.addEventListener("close", () => {
        if (this.#socket !== socket) return;
        const error = new Error("Horizon collaboration socket closed");
        reject(error);
        this.#socket = undefined;
        this.#connectPromise = undefined;
        this.#rejectPending(error);
      });
    });
    return this.#connectPromise;
  }

  onRemoteAdvance(listener: (update: RemoteAdvance) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async advance(
    batch: DriverBatch,
    requestId: string = crypto.randomUUID(),
  ): Promise<AdvanceOutcome> {
    await this.connect();
    if (this.#pending.has(requestId)) throw new Error("Request is already in flight");
    const response = new Promise<AdvanceOutcome>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
    });
    try {
      this.#send({ type: "advance", data: { request_id: requestId, batch } });
    } catch (error) {
      this.#pending
        .get(requestId)
        ?.reject(error instanceof Error ? error : new Error(String(error)));
      this.#pending.delete(requestId);
    }
    return response;
  }

  async close(): Promise<void> {
    this.#rejectPending(new Error("Horizon collaboration socket closed"));
    this.#socket?.close();
    this.#socket = undefined;
    this.#connectPromise = undefined;
  }

  #rejectPending(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }

  #handle(message: ServerMessage): void {
    switch (message.type) {
      case "deltas":
        this.#listeners.forEach((listener) => listener(message.data));
        if (message.data.has_more) {
          this.#send({
            type: "fetch",
            data: {
              request_id: crypto.randomUUID(),
              timeline_id: message.data.timeline_id,
              known: message.data.frontier,
            },
          });
        }
        return;
      case "advanced": {
        const pending = this.#pending.get(message.data.request_id);
        if (!pending) {
          return;
        }
        this.#pending.delete(message.data.request_id);
        pending.resolve(advanceOutcome(message));
        return;
      }
      case "error": {
        const requestId = message.data.request_id;
        const pending = requestId ? this.#pending.get(requestId) : undefined;
        if (pending && requestId) {
          this.#pending.delete(requestId);
          pending.reject(new Error(message.data.message));
          return;
        }
        throw new Error(message.data.message);
      }
      case "pong":
      case "ready":
        return;
    }
  }

  #send(message: ClientMessage): void {
    if (!this.#socket) {
      throw new Error("Horizon collaboration socket is not open");
    }
    this.#socket.send(JSON.stringify(message));
  }
}
