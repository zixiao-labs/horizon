import type {
  AdvanceOutcome,
  Delta,
  DeltaId,
  DriverBatch,
  IdentityId,
  ThreadId,
  Timeline,
  TimelineId,
  Version,
} from "./thread";

export const protocolVersion = 2;

export interface Subscription {
  readonly timeline_id: TimelineId;
  readonly known: Version;
}

export type ClientMessage =
  | {
      readonly type: "hello";
      readonly data: {
        readonly protocol_version: number;
        readonly subscriptions: readonly Subscription[];
      };
    }
  | {
      readonly type: "advance";
      readonly data: {
        readonly request_id: string;
        readonly batch: DriverBatch;
      };
    }
  | {
      readonly type: "fetch";
      readonly data: {
        readonly request_id: string;
        readonly timeline_id: TimelineId;
        readonly known: Version;
      };
    }
  | {
      readonly type: "ping";
      readonly data: { readonly nonce: string };
    };

export type SyncErrorCode =
  | "unauthorized"
  | "protocol_mismatch"
  | "invalid_delta"
  | "thread_mismatch"
  | "internal";

export interface SyncProtocolError {
  readonly code: SyncErrorCode;
  readonly message: string;
  readonly request_id?: string;
}

export type ServerMessage =
  | {
      readonly type: "ready";
      readonly data: {
        readonly protocol_version: number;
        readonly thread_id: ThreadId;
        readonly identity_id: IdentityId;
        readonly timelines: readonly Timeline[];
      };
    }
  | {
      readonly type: "deltas";
      readonly data: {
        readonly timeline_id: TimelineId;
        readonly frontier: Version;
        readonly deltas: readonly Delta[];
        readonly has_more: boolean;
      };
    }
  | {
      readonly type: "advanced";
      readonly data: {
        readonly request_id: string;
        readonly timeline_id: TimelineId;
        readonly frontier: Version;
        readonly accepted: readonly DeltaId[];
      };
    }
  | {
      readonly type: "error";
      readonly data: SyncProtocolError;
    }
  | {
      readonly type: "pong";
      readonly data: { readonly nonce: string };
    };

export function advanceOutcome(
  message: Extract<ServerMessage, { type: "advanced" }>,
): AdvanceOutcome {
  return {
    accepted: message.data.accepted,
    frontier: message.data.frontier,
  };
}
