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
  readonly #subscriptions: readonly Subscription[];
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
    subscriptions: readonly Subscription[],
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
        this.#send({
          type: "hello",
          data: {
            protocol_version: protocolVersion,
            subscriptions: this.#subscriptions,
          },
        });
      });
      socket.addEventListener("message", (event) => {
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
          void this.close();
        }
      });
      socket.addEventListener("error", () => {
        reject(new Error("Horizon collaboration socket failed"));
      });
      socket.addEventListener("close", () => {
        const error = new Error("Horizon collaboration socket closed");
        for (const pending of this.#pending.values()) {
          pending.reject(error);
        }
        this.#pending.clear();
      });
    });
    return this.#connectPromise;
  }

  onRemoteAdvance(listener: (update: RemoteAdvance) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async advance(batch: DriverBatch): Promise<AdvanceOutcome> {
    await this.connect();
    const requestId = crypto.randomUUID();
    const response = new Promise<AdvanceOutcome>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
    });
    this.#send({
      type: "advance",
      data: {
        request_id: requestId,
        batch,
      },
    });
    return response;
  }

  async close(): Promise<void> {
    this.#socket?.close();
    this.#socket = undefined;
    this.#connectPromise = undefined;
  }

  #handle(message: ServerMessage): void {
    switch (message.type) {
      case "deltas":
        this.#listeners.forEach((listener) => listener(message.data));
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
