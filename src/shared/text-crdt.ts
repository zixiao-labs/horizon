import {
  compareDeltaIds,
  deltaKey,
  type CausalGraph,
  type Delta,
  type DeltaId,
  type Version,
} from "./thread";
import type { ByteRange } from "./collaboration";
import { byteLength, lastFragmentId, sliceFragment, TextIndex } from "./text-index";
export { byteLength } from "./text-index";

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
  /** Contiguous source runs, including tombstones. IDs address the first scalar. */
  readonly fragments: readonly TextFragment[];
}

const indexes = new WeakMap<TextSnapshot, TextIndex>();
export function textIndex(snapshot: TextSnapshot): TextIndex {
  let index = indexes.get(snapshot);
  if (!index) {
    index = new TextIndex(snapshot.fragments);
    indexes.set(snapshot, index);
  }
  return index;
}

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
  return textIndex(snapshot).select(range);
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
    pending.push(...[...(children.get(lastFragmentId(node)) ?? [])].reverse());
  }
  return {
    text: fragments
      .filter((node) => !node.deleted)
      .map((node) => node.text)
      .join(""),
    fragments,
  };
}

/** RGA source runs. Splitting never changes (creating delta, byte offset) IDs.
 * Insertions split only at their predecessor; deletes split observed source spans.
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
    const split = (origin: DeltaId, offset: number) => {
      for (const node of nodes.values()) {
        const end = node.offset + byteLength(node.text);
        if (deltaKey(node.origin) !== deltaKey(origin) || offset <= node.offset || offset >= end)
          continue;
        const cut = offset - node.offset;
        const first = sliceFragment(node, 0, cut);
        const rest = sliceFragment(node, cut, end - node.offset);
        nodes.set(first.id, first);
        nodes.set(rest.id, rest);
        break;
      }
    };
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
        const predecessor = textIndex(base).before(data.range.start);
        if (predecessor) {
          left = lastFragmentId(predecessor);
          split(predecessor.origin, predecessor.offset + byteLength(predecessor.text));
        }
        for (const fragment of removed) {
          const end = fragment.offset + byteLength(fragment.text);
          split(fragment.origin, fragment.offset);
          split(fragment.origin, end);
          for (const node of nodes.values()) {
            if (
              deltaKey(node.origin) === deltaKey(fragment.origin) &&
              node.offset >= fragment.offset &&
              node.offset < end
            )
              nodes.set(node.id, { ...node, deleted: true });
          }
        }
      }
      if (data.text) {
        const id = `${deltaKey(delta.id)}@0`;
        nodes.set(id, {
          id,
          origin: delta.id,
          offset: 0,
          text: data.text,
          left,
          height: heights.get(deltaKey(delta.id))!,
          deleted: false,
        });
      }
    }
    if (!created) throw new Error(`Unknown buffer ${bufferId}`);
    const snapshot = orderFragments(nodes);
    this.#cache.set(cacheKey, snapshot);
    return snapshot;
  }
}

export function appendFragments(delta: Delta, text: string): readonly TextFragment[] {
  return text
    ? [
        {
          id: `${deltaKey(delta.id)}@0`,
          origin: delta.id,
          offset: 0,
          text,
          left: null,
          height: 0,
          deleted: false,
        },
      ]
    : [];
}
