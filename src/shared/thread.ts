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

  has(id: DeltaId): boolean {
    return this.#deltas.has(deltaKey(id));
  }

  get(id: DeltaId): Delta | undefined {
    return this.#deltas.get(deltaKey(id));
  }

  insert(delta: Delta): "inserted" | "already_present" {
    const key = deltaKey(delta.id);
    const existing = this.#deltas.get(key);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(delta)) {
        throw new Error(`Delta ${key} already exists with different contents`);
      }
      return "already_present";
    }
    if (delta.id.actor !== delta.context.actor_id) {
      throw new Error(`Delta ${key} does not match its context actor`);
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
    const collect = (id: DeltaId): void => {
      const key = deltaKey(id);
      if (covered.has(key)) {
        return;
      }
      covered.add(key);
      this.get(id)?.parents.forEach(collect);
    };
    known.forEach(collect);

    const visited = new Set<string>();
    const result: Delta[] = [];
    const visit = (id: DeltaId): void => {
      const key = deltaKey(id);
      if (covered.has(key) || visited.has(key)) {
        return;
      }
      visited.add(key);
      const delta = this.get(id);
      if (!delta) {
        return;
      }
      delta.parents.forEach(visit);
      result.push(delta);
    };
    desired.forEach(visit);
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

  timeline(id: TimelineId): Timeline | undefined {
    return this.#timelines.get(id);
  }

  currentVersion(id: TimelineId): Version {
    return this.timeline(id)?.frontier ?? [];
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
  return [...unique.values()].sort((left, right) => deltaKey(left).localeCompare(deltaKey(right)));
}

export function deltaKey(id: DeltaId): string {
  return `${id.actor}:${id.sequence}`;
}

function sameDelta(left: DeltaId, right: DeltaId): boolean {
  return left.actor === right.actor && left.sequence === right.sequence;
}
