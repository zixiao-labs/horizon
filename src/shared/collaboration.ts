import type { DeltaId, IdentityId, JsonValue, RunId, Version, WorktreeId } from "./thread";

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** An immutable historical selection. Offsets are UTF-8, end exclusive. */
export interface SelectionAnchor {
  readonly version: Version;
  readonly range: ByteRange;
  readonly quote: string;
  readonly target:
    | { readonly kind: "transcript" }
    | {
        readonly kind: "file";
        readonly worktree_id: WorktreeId;
        readonly path: string;
        readonly buffer_id: string;
        readonly side?: "before" | "after";
      };
}

export type CommentDelta =
  | {
      readonly operation: "created";
      readonly comment_id: string;
      readonly anchor: SelectionAnchor;
      readonly body: string;
      readonly attachments: readonly Attachment[];
    }
  | {
      readonly operation: "replied";
      readonly comment_id: string;
      readonly reply_id: string;
      readonly body: string;
      readonly attachments: readonly Attachment[];
    }
  | { readonly operation: "resolved"; readonly comment_id: string; readonly resolved: boolean };

export interface Attachment {
  readonly object_id: string;
  readonly media_type: string;
  readonly name: string;
}

/** Logical worktrees sync; absolute machine paths deliberately do not. */
export interface CheckoutBinding {
  readonly worktree_id: WorktreeId;
  readonly machine_id: string;
  readonly mode: "isolated" | "local" | "git_worktree";
  readonly path: string;
  readonly locked: boolean;
}

export type ReviewBase =
  | { readonly kind: "version"; readonly version: Version }
  | { readonly kind: "last_turn"; readonly run_id: RunId; readonly version: Version }
  | { readonly kind: "commit"; readonly commit: string; readonly version: Version }
  | {
      readonly kind: "upstream";
      readonly ref: string;
      readonly merge_base: string;
      readonly version: Version;
    };

export type ReviewDelta =
  | {
      readonly operation: "verdict";
      readonly review_id: string;
      readonly verdict: "approved" | "changes_requested";
      /** Pinned at submission; never interpreted as the source's latest state. */
      readonly worktrees: readonly {
        readonly worktree_id: WorktreeId;
        readonly version: Version;
      }[];
    }
  | {
      readonly operation: "file_seen";
      readonly worktree_id: WorktreeId;
      readonly path: string;
      readonly version: Version;
      readonly seen: boolean;
    };

export interface ContextUsage {
  readonly run_id: RunId;
  readonly model: string;
  readonly context_window: number;
  readonly used_tokens: number;
  readonly compact_at?: number;
  readonly automatic_compaction: boolean;
  /** Bytes and tokens are distinct; no guessed byte-to-token conversions. */
  readonly breakdown: readonly {
    readonly category:
      | "system"
      | "tool_definitions"
      | "thinking"
      | "messages"
      | "tool_inputs"
      | "tool_outputs";
    readonly tool_name?: string;
    readonly bytes: number;
    readonly tokens?: number;
  }[];
}

export interface EditArtifact {
  readonly tool_call_id: string;
  readonly worktree_id: WorktreeId;
  readonly before: Version;
  readonly after: Version;
  readonly paths: readonly string[];
}

export type CollaborationPayload =
  | { readonly kind: "comment"; readonly data: CommentDelta }
  | { readonly kind: "review"; readonly data: ReviewDelta }
  | { readonly kind: "context_usage"; readonly data: ContextUsage }
  | { readonly kind: "edit_artifact"; readonly data: EditArtifact };

export interface ProvenancedValue {
  readonly delta_id: DeltaId;
  readonly identity_id: IdentityId;
  readonly value: JsonValue;
}
