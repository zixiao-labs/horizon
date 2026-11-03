import {
  compareDeltaIds,
  deltaKey,
  type CausalGraph,
  type Delta,
  type DeltaId,
  type Version,
} from "./thread";
import type { ByteRange } from "./collaboration";

export interface TextFragment {
  readonly id: string;
  readonly origin: DeltaId;
  readonly offset: number;
  readonly text: string;
  readonly left: string | null;
  readonly height: number;
  readonly deleted: boolean;
}

export interface TextSnapshot {
  readonly text: string;
  /** Includes tombstones so historical positions remain resolvable. */
  readonly fragments: readonly TextFragment[];
}

const encoder = new TextEncoder();
export const byteLength = (text: string): number => encoder.encode(text).length;

export function orderedDeltas(
  graph: CausalGraph,
  version: Version,
): { deltas: readonly Delta[]; heights: Map<string, number> } {
  graph.validateVersion(version);
  const deltas = [...graph.missingFrom(version, [])];
  const heights = new Map<string, number>();
  for (const delta of deltas) {
    heights.set(
      deltaKey(delta.id),
      1 + Math.max(0, ...delta.parents.map((id) => heights.get(deltaKey(id))!)),
    );
  }
  deltas.sort(
    (a, b) =>
      heights.get(deltaKey(a.id))! - heights.get(deltaKey(b.id))! || compareDeltaIds(a.id, b.id),
  );
  return { deltas, heights };
}

export function selectFragments(snapshot: TextSnapshot, range: ByteRange): readonly TextFragment[] {
  if (
    !Number.isSafeInteger(range.start) ||
    !Number.isSafeInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start
  ) {
    throw new Error("Invalid UTF-8 byte range");
  }
  let offset = 0;
  const boundaries = new Set([0]);
  const selected: TextFragment[] = [];
  for (const fragment of snapshot.fragments) {
    if (fragment.deleted) continue;
    if (offset >= range.start && offset < range.end) selected.push(fragment);
    offset += byteLength(fragment.text);
    boundaries.add(offset);
  }
  if (!boundaries.has(range.start) || !boundaries.has(range.end)) {
    throw new Error("Range is outside the buffer or splits a UTF-8 scalar");
  }
  return selected;
}

function orderFragments(nodes: ReadonlyMap<string, TextFragment>): TextSnapshot {
  const children = new Map<string | null, TextFragment[]>();
  for (const node of nodes.values()) {
    const list = children.get(node.left) ?? [];
    list.push(node);
    children.set(node.left, list);
  }
  for (const list of children.values()) {
    // Later causal inserts precede the original continuation. Concurrent
    // insertions use actor/sequence order, never wall clocks or arrival order.
    list.sort(
      (a, b) => b.height - a.height || compareDeltaIds(a.origin, b.origin) || a.offset - b.offset,
    );
  }
  const pending = [...(children.get(null) ?? [])].reverse();
  const fragments: TextFragment[] = [];
  while (pending.length) {
    const node = pending.pop()!;
    fragments.push(node);
    pending.push(...[...(children.get(node.id) ?? [])].reverse());
  }
  return {
    text: fragments
      .filter((node) => !node.deleted)
      .map((node) => node.text)
      .join(""),
    fragments,
  };
}

/** Reference RGA fragment index. Stable IDs are (creating delta, UTF-8 offset).
 * Scalar fragments favor correctness over run coalescing; wire edits remain ranges.
 */
export class TextMaterializer {
  readonly #graph: CausalGraph;
  readonly #cache = new Map<string, TextSnapshot>();

  constructor(graph: CausalGraph) {
    this.#graph = graph;
  }

  at(bufferId: string, version: Version): TextSnapshot {
    const cacheKey = JSON.stringify([bufferId, this.#graph.reduce(version)]);
    const cached = this.#cache.get(cacheKey);
    if (cached) return cached;
    const { deltas, heights } = orderedDeltas(this.#graph, version);
    const nodes = new Map<string, TextFragment>();
    let created = false;
    for (const delta of deltas) {
      if (delta.payload.kind !== "text" || delta.payload.data.buffer_id !== bufferId) continue;
      const data = delta.payload.data;
      let left: string | null = null;
      if (data.operation === "created") {
        if (created) throw new Error(`Buffer ${bufferId} was created twice`);
        created = true;
      } else {
        this.#graph.validateVersion(data.based_on);
        if (!this.#graph.dominates(delta.parents, data.based_on))
          throw new Error("Text base is not in the edit's causal past");
        const base = this.at(bufferId, data.based_on);
        const removed = selectFragments(base, data.range);
        let offset = 0;
        for (const fragment of base.fragments) {
          if (fragment.deleted) continue;
          if (offset < data.range.start) left = fragment.id;
          offset += byteLength(fragment.text);
        }
        for (const fragment of removed) {
          const current = nodes.get(fragment.id);
          if (!current) throw new Error("Text edit references an absent fragment");
          nodes.set(fragment.id, { ...current, deleted: true });
        }
      }
      let offset = 0;
      for (const text of data.text) {
        const id = `${deltaKey(delta.id)}@${offset}`;
        nodes.set(id, {
          id,
          origin: delta.id,
          offset,
          text,
          left,
          height: heights.get(deltaKey(delta.id))!,
          deleted: false,
        });
        left = id;
        offset += byteLength(text);
      }
    }
    if (!created) throw new Error(`Unknown buffer ${bufferId}`);
    const snapshot = orderFragments(nodes);
    this.#cache.set(cacheKey, snapshot);
    return snapshot;
  }
}

export function appendFragments(delta: Delta, text: string): readonly TextFragment[] {
  let offset = 0;
  return [...text].map((character) => {
    const fragment: TextFragment = {
      id: `${deltaKey(delta.id)}@${offset}`,
      origin: delta.id,
      offset,
      text: character,
      left: null,
      height: 0,
      deleted: false,
    };
    offset += byteLength(character);
    return fragment;
  });
}
