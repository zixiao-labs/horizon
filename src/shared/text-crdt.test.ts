import { describe, expect, it } from "@lightning-js/lightning";
import {
  CausalGraph,
  compareDeltaIds,
  deltaKey,
  type Delta,
  type DeltaPayload,
  type Version,
} from "./thread";
import {
  byteLength,
  orderedDeltas,
  selectFragments,
  TextMaterializer,
  type TextFragment,
  type TextSnapshot,
} from "./text-crdt";
import { TextIndex } from "./text-index";
import { materialize, resolveAnchor } from "./snapshot";

function change(actor: string, sequence: number, parents: Version, payload: DeltaPayload): Delta {
  return {
    id: { actor, sequence },
    parents,
    payload,
    context: { actor_id: actor, driver_id: "driver", driver_kind: "collab", identity_id: "person" },
  };
}

const references = new WeakMap<CausalGraph, Map<string, TextSnapshot>>();
/** Independent scalar RGA oracle: deliberately does not share run splitting/indexing. */
function reference(graph: CausalGraph, version: Version): TextSnapshot {
  const cache = references.get(graph) ?? new Map<string, TextSnapshot>();
  references.set(graph, cache);
  const key = JSON.stringify(version);
  const cached = cache.get(key);
  if (cached) return cached;
  const { deltas, heights } = orderedDeltas(graph, version);
  const nodes = new Map<string, TextFragment>();
  for (const delta of deltas) {
    if (delta.payload.kind !== "text") continue;
    const data = delta.payload.data;
    let left: string | null = null;
    if (data.operation === "edited") {
      const base = reference(graph, data.based_on);
      let offset = 0;
      for (const scalar of base.fragments.filter((item) => !item.deleted)) {
        if (offset < data.range.start) left = scalar.id;
        if (offset >= data.range.start && offset < data.range.end)
          nodes.set(scalar.id, { ...nodes.get(scalar.id)!, deleted: true });
        offset += byteLength(scalar.text);
      }
    }
    let offset = 0;
    for (const scalar of data.text) {
      const id = `${deltaKey(delta.id)}@${offset}`;
      nodes.set(id, {
        id,
        origin: delta.id,
        offset,
        text: scalar,
        left,
        height: heights.get(deltaKey(delta.id))!,
        deleted: false,
      });
      left = id;
      offset += byteLength(scalar);
    }
  }
  const children = new Map<string | null, TextFragment[]>();
  for (const node of nodes.values()) {
    const list = children.get(node.left) ?? [];
    list.push(node);
    children.set(node.left, list);
  }
  for (const list of children.values())
    list.sort(
      (a, b) => b.height - a.height || compareDeltaIds(a.origin, b.origin) || a.offset - b.offset,
    );
  const fragments: TextFragment[] = [];
  const pending = [...(children.get(null) ?? [])].reverse();
  while (pending.length) {
    const node = pending.pop()!;
    fragments.push(node);
    pending.push(...[...(children.get(node.id) ?? [])].reverse());
  }
  const snapshot = {
    text: fragments
      .filter((node) => !node.deleted)
      .map((node) => node.text)
      .join(""),
    fragments,
  };
  cache.set(key, snapshot);
  return snapshot;
}

function expand(snapshot: TextSnapshot): readonly TextFragment[] {
  return snapshot.fragments.flatMap((run) => {
    let offset = run.offset;
    let left = run.left;
    return [...run.text].map((text) => {
      const id = `${deltaKey(run.origin)}@${offset}`;
      const scalar = { ...run, id, offset, text, left };
      left = id;
      offset += byteLength(text);
      return scalar;
    });
  });
}

describe("run-fragment text index", () => {
  it("matches scalar RGA identities under deterministic branching historical edits", () => {
    let seed = 0xdecafbad;
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % limit;
    };
    const root = change("root", 1, [], {
      kind: "text",
      data: { operation: "created", buffer_id: "buffer", text: "\uFEFFa🙂你é\r\nxyz" },
    });
    const graph = new CausalGraph([root]);
    const versions: Version[] = [[root.id]];
    let current: Version = [root.id];
    for (let index = 0; index < 60; index++) {
      const basedOn = versions[random(versions.length)]!;
      const base = reference(graph, basedOn);
      const boundaries = [0];
      for (const scalar of base.text)
        boundaries.push(boundaries[boundaries.length - 1]! + byteLength(scalar));
      const start = random(boundaries.length);
      const end = start + random(boundaries.length - start);
      const delta = change(`actor${index}`, 1, random(2) ? basedOn : current, {
        kind: "text",
        data: {
          operation: "edited",
          buffer_id: "buffer",
          based_on: basedOn,
          range: { start: boundaries[start]!, end: boundaries[end]! },
          text: ["", "🙂", "你x", "AB", "\uFEFF"][random(5)]!,
        },
      });
      graph.insert(delta);
      current = graph.join(current, [delta.id]);
      versions.push([delta.id]);
      const expected = reference(graph, current);
      const actual = new TextMaterializer(graph).at("buffer", current);
      expect(actual.text).toBe(expected.text);
      expect(expand(actual)).toEqual(expected.fragments);
    }
  });

  it("stores a large insert as one run and splits only touched source boundaries", () => {
    const content = "你🙂abc".repeat(30000);
    const root = change("root", 1, [], {
      kind: "text",
      data: { operation: "created", buffer_id: "buffer", text: content },
    });
    const graph = new CausalGraph([root]);
    const old = new TextMaterializer(graph).at("buffer", [root.id]);
    expect(old.fragments.length).toBe(1);
    expect(
      selectFragments(old, { start: 100000, end: 100003 })
        .map((run) => run.text)
        .join(""),
    ).toBe("你");
    expect(() => selectFragments(old, { start: 4, end: 4 })).toThrow();
    const edit = change("edit", 1, [root.id], {
      kind: "text",
      data: {
        operation: "edited",
        buffer_id: "buffer",
        based_on: [root.id],
        range: { start: 100003, end: 100007 },
        text: "X",
      },
    });
    graph.insert(edit);
    const updated = new TextMaterializer(graph).at("buffer", [edit.id]);
    expect(updated.fragments.length).toBe(4);
    expect(old.fragments.length).toBe(1);
    expect(
      selectFragments(updated, { start: 100000, end: 100007 })
        .map((run) => run.text)
        .join(""),
    ).toBe("你Xabc");
  });

  it("indexes multiple B+ levels, zero-width tombstones and exact run slices", () => {
    const fragments: TextFragment[] = Array.from({ length: 5000 }, (_, index) => ({
      id: `a:${index + 1}@0`,
      origin: { actor: "a", sequence: index + 1 },
      offset: 0,
      text: "你🙂x",
      deleted: index % 3 === 0,
      left: null,
      height: 0,
    }));
    const index = new TextIndex(fragments);
    const visible = fragments
      .filter((run) => !run.deleted)
      .map((run) => run.text)
      .join("");
    expect(index.root.bytes).toBe(byteLength(visible));
    expect(
      index
        .select({ start: 8 * 1000 + 3, end: 8 * 1001 + 3 })
        .map((run) => run.text)
        .join(""),
    ).toBe("🙂x你");
    expect(index.select({ start: index.root.bytes, end: index.root.bytes })).toEqual([]);
    expect(() => index.select({ start: 1, end: 1 })).toThrow();
  });

  it("resolves partially surviving ranges and points across run splits and deletion", () => {
    const root = change("root", 1, [], {
      kind: "transcript",
      data: { operation: "message_started", message_id: "m", role: "user" },
    });
    const stream = change("root", 2, [root.id], {
      kind: "transcript",
      data: {
        operation: "content_appended",
        message_id: "m",
        content_kind: "text",
        content: "a🙂bc",
      },
    });
    const graph = new CausalGraph([root, stream]);
    const anchor = {
      target: { kind: "transcript" as const },
      version: [stream.id],
      range: { start: 1, end: 5 },
      quote: "🙂",
    };
    expect(resolveAnchor(graph, anchor, [stream.id]).ranges).toEqual([{ start: 1, end: 5 }]);
    expect(materialize(graph, [stream.id]).transcript.fragments.length).toBe(1);
    const base = change("a", 1, [], {
      kind: "text",
      data: { operation: "created", buffer_id: "buffer", text: "a🙂bc" },
    });
    const tree = change("a", 2, [base.id], {
      kind: "worktree",
      data: { operation: "created", worktree_id: "tree", project_id: "p", base_commit: "" },
    });
    const file = change("a", 3, [tree.id], {
      kind: "worktree",
      data: { operation: "file_created", worktree_id: "tree", path: "f", buffer_id: "buffer" },
    });
    const edit = change("b", 1, [file.id], {
      kind: "text",
      data: {
        operation: "edited",
        buffer_id: "buffer",
        based_on: [file.id],
        range: { start: 1, end: 5 },
        text: "XYZ",
      },
    });
    const files = new CausalGraph([base, tree, file, edit]);
    const target = { kind: "file" as const, worktree_id: "tree", path: "f", buffer_id: "buffer" };
    expect(
      resolveAnchor(
        files,
        { target, version: [file.id], range: { start: 0, end: 6 }, quote: "a🙂b" },
        [edit.id],
      ).ranges,
    ).toEqual([
      { start: 0, end: 1 },
      { start: 4, end: 5 },
    ]);
    expect(
      resolveAnchor(files, { target, version: [file.id], range: { start: 5, end: 5 }, quote: "" }, [
        edit.id,
      ]).ranges,
    ).toEqual([{ start: 4, end: 4 }]);
  });
});
