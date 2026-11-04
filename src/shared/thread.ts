import type { CollaborationPayload } from "./collaboration";
import { materialize, type ThreadSnapshot } from "./snapshot";

export type ActorId = string;
export type BufferId = string;
export type DriverId = string;
export type IdentityId = string;
export type MapId = string;
export type MessageId = string;
export type ProjectId = string;
export type RegisterId = string;
export type RunId = string;
export type ThreadId = string;
export type TimelineId = string;
export type WorktreeId = string;

export interface DeltaId {
  readonly actor: ActorId;
  readonly sequence: number;
}

export type Version = readonly DeltaId[];
export type DriverKind = "agent" | "collab";
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface DeltaContext {
  readonly driver_id: DriverId;
  readonly driver_kind: DriverKind;
  readonly actor_id: ActorId;
  readonly identity_id: IdentityId;
  readonly run_id?: RunId;
  readonly message_id?: MessageId;
  readonly tool_call_id?: string;
}

export type DeltaPayload =
  | CollaborationPayload
  | {
      readonly kind: "thread";
      readonly data:
        | { readonly operation: "created"; readonly title: string }
        | { readonly operation: "title_changed"; readonly title: string };
    }
  | {
      readonly kind: "register";
      readonly data: {
        readonly register_id: RegisterId;
        readonly value: JsonValue;
      };
    }
  | {
      readonly kind: "map";
      readonly data:
        | {
            readonly operation: "put";
            readonly map_id: MapId;
            readonly key: string;
            readonly value: JsonValue;
          }
        | {
            readonly operation: "remove";
            readonly map_id: MapId;
            readonly key: string;
            readonly observed: Version;
          };
    }
  | {
      readonly kind: "text";
      readonly data:
        | {
            readonly operation: "created";
            readonly buffer_id: BufferId;
            readonly text: string;
          }
        | {
            readonly operation: "edited";
            readonly buffer_id: BufferId;
            readonly based_on: Version;
            /** UTF-8 byte offsets, not Monaco UTF-16 columns. */
            readonly range: { readonly start: number; readonly end: number };
            readonly text: string;
          };
    }
  | {
      readonly kind: "worktree";
      readonly data:
        | {
            readonly operation: "created";
            readonly worktree_id: WorktreeId;
            readonly project_id: ProjectId;
            readonly base_commit: string;
          }
        | {
            readonly operation: "file_created";
            readonly worktree_id: WorktreeId;
            readonly path: string;
            readonly buffer_id: BufferId;
          }
        | {
            readonly operation: "file_removed";
            readonly worktree_id: WorktreeId;
            readonly path: string;
          }
        | {
            readonly operation: "path_moved";
            readonly worktree_id: WorktreeId;
            readonly from: string;
            readonly to: string;
          }
        | {
            readonly operation: "executable_changed";
            readonly worktree_id: WorktreeId;
            readonly path: string;
            readonly executable: boolean;
          }
        | {
            readonly operation: "commit_created";
            readonly worktree_id: WorktreeId;
            readonly commit: string;
            readonly parents: readonly string[];
            readonly message: string;
          };
    }
  | {
      readonly kind: "transcript";
      readonly data:
        | {
            readonly operation: "message_started";
            readonly message_id: MessageId;
            readonly role: "system" | "user" | "assistant" | "tool";
          }
        | {
            readonly operation: "content_appended";
            readonly message_id: MessageId;
            readonly content_kind: string;
            readonly content_index?: number;
            readonly content: string;
          }
        | {
            readonly operation: "message_finished";
            readonly message_id: MessageId;
            readonly message: JsonValue;
          }
        | {
            readonly operation: "tool_started";
            readonly tool_call_id: string;
            readonly name: string;
            readonly arguments: JsonValue;
          }
        | {
            readonly operation: "tool_updated";
            readonly tool_call_id: string;
            readonly update: JsonValue;
          }
        | {
            readonly operation: "tool_finished";
            readonly tool_call_id: string;
            readonly result: JsonValue;
            readonly is_error: boolean;
          };
    }
  | {
      readonly kind: "agent_run";
      readonly data:
        | {
            readonly operation: "started";
            readonly run_id: RunId;
            readonly parent_run_id?: RunId;
          }
        | { readonly operation: "settled"; readonly run_id: RunId }
        | { readonly operation: "aborted"; readonly run_id: RunId }
        | {
            readonly operation: "failed";
            readonly run_id: RunId;
            readonly error: string;
          };
    };

export interface Delta {
  readonly id: DeltaId;
  readonly parents: Version;
  readonly context: DeltaContext;
  readonly payload: DeltaPayload;
}

export interface DriverBatch {
  readonly thread_id: ThreadId;
  readonly timeline_id: TimelineId;
  readonly driver_id: DriverId;
  readonly driver_kind: DriverKind;
  readonly base: Version;
  readonly next: Version;
  readonly timeline_label?: string;
  readonly deltas: readonly Delta[];
}

export interface Timeline {
  readonly id: TimelineId;
  readonly frontier: Version;
  readonly forked_from: Version;
  readonly label?: string;
}

export interface AdvanceOutcome {
  readonly accepted: readonly DeltaId[];
  readonly frontier: Version;
}

export interface RemoteAdvance {
  readonly timeline_id: TimelineId;
  readonly frontier: Version;
  readonly deltas: readonly Delta[];
}

/** Local derived replay cache, not a wire message or permission to prune history. */
export interface ReplicaCheckpoint {
  readonly format: 1;
  readonly thread_id: ThreadId;
  readonly deltas: readonly Delta[];
  readonly timelines: readonly Timeline[];
}

export class CausalGraph {
  readonly #deltas: Map<string, Delta>;

  constructor(deltas: Iterable<Delta> = []) {
    this.#deltas = new Map();
    for (const delta of deltas) {
      this.insert(delta);
    }
  }

  get size(): number {
    return this.#deltas.size;
  }

  clone(): CausalGraph {
    return new CausalGraph(this.#deltas.values());
  }

  deltas(): readonly Delta[] {
    return [...this.#deltas.values()];
  }

  has(id: DeltaId): boolean {
    return this.#deltas.has(deltaKey(id));
  }

  get(id: DeltaId): Delta | undefined {
    return this.#deltas.get(deltaKey(id));
  }

  insert(delta: Delta): "inserted" | "already_present" {
    delta = normalizeDelta(delta);
    const key = deltaKey(delta.id);
    const existing = this.#deltas.get(key);
    if (existing) {
      if (canonicalJson(existing) !== canonicalJson(delta)) {
        throw new Error(`Delta ${key} already exists with different contents`);
      }
      return "already_present";
    }
    if (delta.id.actor !== delta.context.actor_id) {
      throw new Error(`Delta ${key} does not match its context actor`);
    }
    if (!Number.isSafeInteger(delta.id.sequence) || delta.id.sequence < 1) {
      throw new Error("Delta sequence must be a positive safe integer");
    }
    const missing = delta.parents.filter((parent) => !this.has(parent));
    if (missing.length > 0) {
      throw new Error(`Delta ${key} has missing parents: ${missing.map(deltaKey).join(", ")}`);
    }
    this.#deltas.set(key, delta);
    return "inserted";
  }

  validateVersion(version: Version): void {
    const missing = version.find((id) => !this.has(id));
    if (missing) {
      throw new Error(`Version references unknown delta ${deltaKey(missing)}`);
    }
  }

  isAncestor(ancestor: DeltaId, descendant: DeltaId): boolean {
    if (sameDelta(ancestor, descendant)) {
      return true;
    }
    const pending = [descendant];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) {
        continue;
      }
      const key = deltaKey(current);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      const delta = this.get(current);
      if (!delta) {
        continue;
      }
      if (delta.parents.some((parent) => sameDelta(parent, ancestor))) {
        return true;
      }
      pending.push(...delta.parents);
    }
    return false;
  }

  covers(version: Version, id: DeltaId): boolean {
    return version.some((tip) => this.isAncestor(id, tip));
  }

  dominates(next: Version, base: Version): boolean {
    return base.every((id) => this.covers(next, id));
  }

  reduce(version: Version): Version {
    return canonicalVersion(
      version.filter(
        (candidate) =>
          !version.some(
            (other) => !sameDelta(candidate, other) && this.isAncestor(candidate, other),
          ),
      ),
    );
  }

  join(left: Version, right: Version): Version {
    return this.reduce([...left, ...right]);
  }

  missingFrom(desired: Version, known: Version): readonly Delta[] {
    const covered = new Set<string>();
    const ancestors = [...known];
    while (ancestors.length) {
      const id = ancestors.pop()!;
      const key = deltaKey(id);
      if (covered.has(key)) continue;
      covered.add(key);
      ancestors.push(...(this.get(id)?.parents ?? []));
    }

    const visited = new Set<string>();
    const result: Delta[] = [];
    const pending = desired.map((id) => ({ id, expanded: false })).reverse();
    while (pending.length) {
      const { id, expanded } = pending.pop()!;
      const key = deltaKey(id);
      if (covered.has(key)) continue;
      const delta = this.get(id);
      if (!delta) continue;
      if (expanded) {
        result.push(delta);
        continue;
      }
      if (visited.has(key)) continue;
      visited.add(key);
      pending.push({ id, expanded: true });
      pending.push(...delta.parents.map((parent) => ({ id: parent, expanded: false })).reverse());
    }
    return result;
  }
}

/**
 * A passive materialization. Only a Driver may call `advance` or `applyRemote`;
 * the replica owns no timers, sockets, agent loops, or orchestration.
 */
export class ThreadReplica {
  readonly threadId: ThreadId;
  #graph = new CausalGraph();
  #timelines = new Map<TimelineId, Timeline>();

  constructor(threadId: ThreadId) {
    this.threadId = threadId;
  }

  get graph(): CausalGraph {
    return this.#graph;
  }

  clone(): ThreadReplica {
    const replica = new ThreadReplica(this.threadId);
    replica.#graph = this.#graph.clone();
    replica.#timelines = new Map(this.#timelines);
    return replica;
  }

  checkpoint(): ReplicaCheckpoint {
    return {
      format: 1,
      thread_id: this.threadId,
      deltas: this.#graph.deltas(),
      timelines: [...this.#timelines.values()],
    };
  }

  /** Validate the graph once, not once for every historical driver transition. */
  static fromCheckpoint(checkpoint: ReplicaCheckpoint): ThreadReplica {
    if (checkpoint.format !== 1) throw new Error("Unsupported replica checkpoint");
    const replica = new ThreadReplica(checkpoint.thread_id);
    replica.#graph = new CausalGraph(checkpoint.deltas);
    for (const timeline of checkpoint.timelines) {
      if (replica.#timelines.has(timeline.id)) throw new Error("Duplicate checkpoint timeline");
      replica.#graph.validateVersion(timeline.frontier);
      replica.#graph.validateVersion(timeline.forked_from);
      if (!replica.#graph.dominates(timeline.frontier, timeline.forked_from))
        throw new Error("Checkpoint timeline precedes its fork");
      replica.snapshot(timeline.frontier);
      replica.#timelines.set(timeline.id, timeline);
    }
    return replica;
  }

  timeline(id: TimelineId): Timeline | undefined {
    return this.#timelines.get(id);
  }

  currentVersion(id: TimelineId): Version {
    return this.timeline(id)?.frontier ?? [];
  }

  snapshot(version: Version): ThreadSnapshot {
    return materialize(this.#graph, version);
  }

  advance(batch: DriverBatch): AdvanceOutcome {
    if (batch.thread_id !== this.threadId) {
      throw new Error(`Batch targets thread ${batch.thread_id}, expected ${this.threadId}`);
    }
    const staged = this.#graph.clone();
    staged.validateVersion(batch.base);
    const accepted: DeltaId[] = [];
    for (const delta of batch.deltas) {
      if (
        delta.context.driver_id !== batch.driver_id ||
        delta.context.driver_kind !== batch.driver_kind
      ) {
        throw new Error(`Delta ${deltaKey(delta.id)} does not belong to the batch driver`);
      }
      if (staged.insert(delta) === "inserted") {
        accepted.push(delta.id);
      }
    }
    staged.validateVersion(batch.next);
    if (!staged.dominates(batch.next, batch.base)) {
      throw new Error("Driver batch moves the timeline backward");
    }
    const orphan = batch.deltas.find((delta) => !staged.covers(batch.next, delta.id));
    if (orphan) {
      throw new Error(`Submitted delta ${deltaKey(orphan.id)} is absent from next version`);
    }

    const current = this.currentVersion(batch.timeline_id);
    const frontier = staged.join(current, batch.next);
    materialize(staged, frontier);
    const previous = this.timeline(batch.timeline_id);
    this.#graph = staged;
    this.#timelines.set(batch.timeline_id, {
      id: batch.timeline_id,
      frontier,
      forked_from: previous?.forked_from ?? batch.base,
      label: batch.timeline_label ?? previous?.label,
    });
    return { accepted, frontier };
  }

  applyRemote(update: RemoteAdvance): AdvanceOutcome {
    const staged = this.#graph.clone();
    const accepted: DeltaId[] = [];
    for (const delta of update.deltas) {
      if (staged.insert(delta) === "inserted") {
        accepted.push(delta.id);
      }
    }
    staged.validateVersion(update.frontier);
    const previous = this.timeline(update.timeline_id);
    const frontier = staged.join(previous?.frontier ?? [], update.frontier);
    materialize(staged, frontier);
    this.#graph = staged;
    this.#timelines.set(update.timeline_id, {
      id: update.timeline_id,
      frontier,
      forked_from: previous?.forked_from ?? [],
      label: previous?.label,
    });
    return { accepted, frontier };
  }
}

export function canonicalVersion(ids: Version): Version {
  const unique = new Map(ids.map((id) => [deltaKey(id), id]));
  return [...unique.values()].sort(compareDeltaIds);
}

/** Matches Rust's (UUID bytes, numeric sequence) order, independent of locale. */
export function compareDeltaIds(left: DeltaId, right: DeltaId): number {
  return compareStrings(left.actor, right.actor) || left.sequence - right.sequence;
}

export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function deltaKey(id: DeltaId): string {
  return `${id.actor}:${id.sequence}`;
}

function sameDelta(left: DeltaId, right: DeltaId): boolean {
  return left.actor === right.actor && left.sequence === right.sequence;
}

/** JSON object order is not significant; application arrays still are. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => compareStrings(a, b)));
    }
    return item;
  });
}

function normalizeDelta(delta: Delta): Delta {
  let payload = delta.payload;
  switch (payload.kind) {
    case "text":
      if (payload.data.operation === "edited")
        payload = {
          ...payload,
          data: { ...payload.data, based_on: canonicalVersion(payload.data.based_on) },
        };
      break;
    case "map":
      if (payload.data.operation === "remove")
        payload = {
          ...payload,
          data: { ...payload.data, observed: canonicalVersion(payload.data.observed) },
        };
      break;
    case "comment":
      if (payload.data.operation === "created")
        payload = {
          ...payload,
          data: {
            ...payload.data,
            anchor: {
              ...payload.data.anchor,
              version: canonicalVersion(payload.data.anchor.version),
            },
          },
        };
      break;
    case "review":
      payload =
        payload.data.operation === "verdict"
          ? {
              ...payload,
              data: {
                ...payload.data,
                worktrees: payload.data.worktrees.map((tree) => ({
                  ...tree,
                  version: canonicalVersion(tree.version),
                })),
              },
            }
          : {
              ...payload,
              data: { ...payload.data, version: canonicalVersion(payload.data.version) },
            };
      break;
    case "edit_artifact":
      payload = {
        ...payload,
        data: {
          ...payload.data,
          before: canonicalVersion(payload.data.before),
          after: canonicalVersion(payload.data.after),
        },
      };
      break;
  }
  return { ...delta, parents: canonicalVersion(delta.parents), payload };
}
