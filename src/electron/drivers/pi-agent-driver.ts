import type { Agent, AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  DeltaContext,
  DeltaPayload,
  JsonValue,
  MessageId,
  Version,
} from "../../shared/thread";
import type { AgentDriver, AgentDriverIdentity, ThreadAdvancePort } from "./types";

type PiAgentRuntime = Pick<
  Agent,
  "subscribe" | "prompt" | "steer" | "followUp" | "abort" | "waitForIdle"
>;

export type PiAgentFactory = (identity: AgentDriverIdentity) => PiAgentRuntime;

export class PiAgentDriverFactory {
  readonly #createAgent: PiAgentFactory;
  readonly #advance: ThreadAdvancePort;

  constructor(createAgent: PiAgentFactory, advance: ThreadAdvancePort) {
    this.#createAgent = createAgent;
    this.#advance = advance;
  }

  create(identity: AgentDriverIdentity): PiAgentDriver {
    return new PiAgentDriver(identity, this.#createAgent(identity), this.#advance);
  }
}

export class PiAgentDriver implements AgentDriver {
  readonly threadId;
  readonly timelineId;
  readonly driverId;
  readonly actorId;
  readonly identityId;
  readonly runId;
  readonly parentRunId;

  readonly #agent: PiAgentRuntime;
  readonly #advance: ThreadAdvancePort;
  readonly #unsubscribe: () => void;
  readonly #messageIds = new WeakMap<object, MessageId>();
  #activeAssistantMessage?: MessageId;
  #sequence = 0;
  #abortRequested = false;
  #terminalRecorded = false;
  #started = false;
  #disposed = false;

  constructor(identity: AgentDriverIdentity, agent: PiAgentRuntime, advance: ThreadAdvancePort) {
    this.threadId = identity.threadId;
    this.timelineId = identity.timelineId;
    this.driverId = identity.driverId;
    this.actorId = identity.actorId;
    this.identityId = identity.identityId;
    this.runId = identity.runId;
    this.parentRunId = identity.parentRunId;
    this.#agent = agent;
    this.#advance = advance;
    this.#unsubscribe = agent.subscribe((event) => this.#record(event));
  }

  async prompt(prompt: string): Promise<void> {
    this.#assertActive();
    if (this.#started) {
      throw new Error("An AgentDriver owns exactly one Pi agent run");
    }
    this.#started = true;
    try {
      await this.#agent.prompt(prompt);
    } catch (error) {
      await this.#recordFailure(error);
      throw error;
    }
  }

  steer(prompt: string): void {
    this.#assertActive();
    this.#agent.steer(userMessage(prompt));
  }

  followUp(prompt: string): void {
    this.#assertActive();
    this.#agent.followUp(userMessage(prompt));
  }

  async abort(): Promise<void> {
    this.#assertActive();
    this.#abortRequested = true;
    this.#agent.abort();
    await this.#agent.waitForIdle();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#agent.abort();
    await this.#agent.waitForIdle();
    this.#unsubscribe();
  }

  async #record(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case "agent_start":
        await this.#commit({
          kind: "agent_run",
          data: {
            operation: "started",
            run_id: this.runId,
            parent_run_id: this.parentRunId,
          },
        });
        return;
      case "agent_end": {
        if (this.#terminalRecorded) {
          return;
        }
        this.#terminalRecorded = true;
        await this.#commit({
          kind: "agent_run",
          data: {
            operation: this.#abortRequested ? "aborted" : "settled",
            run_id: this.runId,
          },
        });
        return;
      }
      case "message_start": {
        const messageId = this.#messageId(event.message);
        if (event.message.role === "assistant") {
          this.#activeAssistantMessage = messageId;
        }
        await this.#commit(
          {
            kind: "transcript",
            data: {
              operation: "message_started",
              message_id: messageId,
              role: transcriptRole(event.message),
            },
          },
          { message_id: messageId },
        );
        return;
      }
      case "message_update": {
        const update = event.assistantMessageEvent;
        if (
          update.type !== "text_delta" &&
          update.type !== "thinking_delta" &&
          update.type !== "toolcall_delta"
        ) {
          return;
        }
        const messageId = this.#activeAssistantMessage ?? this.#messageId(event.message);
        await this.#commit(
          {
            kind: "transcript",
            data: {
              operation: "content_appended",
              message_id: messageId,
              content_kind: update.type.replace("_delta", ""),
              content: update.delta,
            },
          },
          { message_id: messageId },
        );
        return;
      }
      case "message_end": {
        const messageId =
          event.message.role === "assistant" && this.#activeAssistantMessage
            ? this.#activeAssistantMessage
            : this.#messageId(event.message);
        await this.#commit(
          {
            kind: "transcript",
            data: {
              operation: "message_finished",
              message_id: messageId,
              message: asJson(event.message),
            },
          },
          { message_id: messageId },
        );
        if (event.message.role === "assistant") {
          this.#activeAssistantMessage = undefined;
        }
        return;
      }
      case "tool_execution_start":
        await this.#commit(
          {
            kind: "transcript",
            data: {
              operation: "tool_started",
              tool_call_id: event.toolCallId,
              name: event.toolName,
              arguments: asJson(event.args),
            },
          },
          { tool_call_id: event.toolCallId },
        );
        return;
      case "tool_execution_update":
        await this.#commit(
          {
            kind: "transcript",
            data: {
              operation: "tool_updated",
              tool_call_id: event.toolCallId,
              update: asJson(event.partialResult),
            },
          },
          { tool_call_id: event.toolCallId },
        );
        return;
      case "tool_execution_end":
        await this.#commit(
          {
            kind: "transcript",
            data: {
              operation: "tool_finished",
              tool_call_id: event.toolCallId,
              result: asJson(event.result),
              is_error: event.isError,
            },
          },
          { tool_call_id: event.toolCallId },
        );
        return;
      case "turn_start":
      case "turn_end":
        return;
    }
  }

  async #recordFailure(error: unknown): Promise<void> {
    if (this.#terminalRecorded) {
      return;
    }
    this.#terminalRecorded = true;
    await this.#commit({
      kind: "agent_run",
      data: {
        operation: "failed",
        run_id: this.runId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  async #commit(payload: DeltaPayload, extraContext: Partial<DeltaContext> = {}): Promise<void> {
    const base: Version = this.#advance.currentVersion(this.timelineId);
    const id = { actor: this.actorId, sequence: ++this.#sequence };
    await this.#advance.advance({
      thread_id: this.threadId,
      timeline_id: this.timelineId,
      driver_id: this.driverId,
      driver_kind: "agent",
      base,
      next: [id],
      deltas: [
        {
          id,
          parents: base,
          context: {
            driver_id: this.driverId,
            driver_kind: "agent",
            actor_id: this.actorId,
            identity_id: this.identityId,
            run_id: this.runId,
            ...extraContext,
          },
          payload,
        },
      ],
    });
  }

  #messageId(message: AgentMessage): MessageId {
    const object = message as object;
    const existing = this.#messageIds.get(object);
    if (existing) {
      return existing;
    }
    const id = crypto.randomUUID() as MessageId;
    this.#messageIds.set(object, id);
    return id;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error("PiAgentDriver is disposed");
    }
  }
}

function userMessage(content: string): AgentMessage {
  return { role: "user", content, timestamp: Date.now() };
}

function transcriptRole(message: AgentMessage): "system" | "user" | "assistant" | "tool" {
  if (message.role === "system" || message.role === "user" || message.role === "assistant") {
    return message.role;
  }
  return "tool";
}

function asJson(value: unknown): JsonValue {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? null : (JSON.parse(encoded) as JsonValue);
}
