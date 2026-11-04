import { describe, expect, it } from "@lightning-js/lightning";
import {
  CausalGraph,
  ThreadReplica,
  canonicalVersion,
  type Delta,
  type DeltaPayload,
  type Version,
} from "./thread";
import { materialize, resolveAnchor } from "./snapshot";
import type { SelectionAnchor } from "./collaboration";
import { PersistentTree } from "./persistent-tree";
import { diffWorktree, isFileSeen } from "./review";

export function change(
  actor: string,
  sequence: number,
  parents: Version,
  payload: DeltaPayload,
): Delta {
  return {
    id: { actor, sequence },
    parents,
    context: { actor_id: actor, driver_id: "driver", driver_kind: "collab", identity_id: "person" },
    payload,
  };
}

export function apply(replica: ThreadReplica, delta: Delta): void {
  replica.advance({
    thread_id: replica.threadId,
    timeline_id: "main",
    driver_id: "driver",
    driver_kind: "collab",
    base: delta.parents,
    next: [delta.id],
    deltas: [delta],
  });
}

describe("versioned materialization", () => {
  it("converges concurrent inserts/deletes, reifies history and rejects split UTF-8", () => {
    const base = change("root", 1, [], {
      kind: "text",
      data: { operation: "created", buffer_id: "buffer", text: "TIVITY🙂" },
    });
    const left = change("a", 1, [base.id], {
      kind: "text",
      data: {
        operation: "edited",
        buffer_id: "buffer",
        based_on: [base.id],
        range: { start: 0, end: 0 },
        text: "REA",
      },
    });
    const right = change("b", 1, [base.id], {
      kind: "text",
      data: {
        operation: "edited",
        buffer_id: "buffer",
        based_on: [base.id],
        range: { start: 0, end: 0 },
        text: "C",
      },
    });
    const remove = change("c", 1, [base.id], {
      kind: "text",
      data: {
        operation: "edited",
        buffer_id: "buffer",
        based_on: [base.id],
        range: { start: 6, end: 10 },
        text: "",
      },
    });
    for (const order of [
      [left, right, remove],
      [remove, right, left],
      [right, left, remove],
    ]) {
      const replica = new ThreadReplica("thread");
      [base, ...order].forEach((delta) => apply(replica, delta));
      expect(replica.snapshot(replica.currentVersion("main")).buffers.get("buffer")?.text).toBe(
        "REACTIVITY",
      );
      expect(replica.snapshot([base.id]).buffers.get("buffer")?.text).toBe("TIVITY🙂");
      const malformed = change("bad", 1, [base.id], {
        kind: "text",
        data: {
          operation: "edited",
          buffer_id: "buffer",
          based_on: [base.id],
          range: { start: 7, end: 8 },
          text: "x",
        },
      });
      expect(() => apply(replica, malformed)).toThrow();
      expect(replica.graph.has(malformed.id)).toBe(false);
    }
  });

  it("retains concurrent register values and add-wins map entries", () => {
    const initial = change("a", 1, [], {
      kind: "map",
      data: { operation: "put", map_id: "m", key: "k", value: "old" },
    });
    const remove = change("a", 2, [initial.id], {
      kind: "map",
      data: { operation: "remove", map_id: "m", key: "k", observed: [initial.id] },
    });
    const put = change("b", 1, [initial.id], {
      kind: "map",
      data: { operation: "put", map_id: "m", key: "k", value: "new" },
    });
    const one = change("c", 1, [], { kind: "register", data: { register_id: "r", value: 1 } });
    const two = change("d", 1, [], { kind: "register", data: { register_id: "r", value: 2 } });
    const graph = new CausalGraph([initial, remove, put, one, two]);
    const snapshot = materialize(graph, [remove.id, put.id, one.id, two.id]);
    expect(snapshot.maps.get(JSON.stringify(["m", "k"]))?.map((entry) => entry.value)).toEqual([
      "new",
    ]);
    expect(snapshot.registers.get("r")?.map((entry) => entry.value)).toEqual([1, 2]);
    expect(
      canonicalVersion([
        { actor: "a", sequence: 10 },
        { actor: "a", sequence: 2 },
      ]).map((id) => id.sequence),
    ).toEqual([2, 10]);
  });

  it("preserves streamed sections and linked comments without duplicating the final message", () => {
    const replica = new ThreadReplica("thread");
    const start = change("a", 1, [], {
      kind: "transcript",
      data: { operation: "message_started", message_id: "message", role: "assistant" },
    });
    const stream = change("a", 2, [start.id], {
      kind: "transcript",
      data: {
        operation: "content_appended",
        message_id: "message",
        content_kind: "text",
        content_index: 0,
        content: "你好🙂",
      },
    });
    const anchor: SelectionAnchor = {
      target: { kind: "transcript" },
      version: [stream.id],
      range: { start: 6, end: 10 },
      quote: "🙂",
    };
    const comment = change("b", 1, [stream.id], {
      kind: "comment",
      data: { operation: "created", comment_id: "comment", anchor, body: "why?", attachments: [] },
    });
    const finish = change("a", 3, [stream.id], {
      kind: "transcript",
      data: {
        operation: "message_finished",
        message_id: "message",
        message: { content: [{ type: "text", text: "你好🙂" }] },
      },
    });
    const reply = change("b", 2, [comment.id, finish.id], {
      kind: "comment",
      data: {
        operation: "replied",
        comment_id: "comment",
        reply_id: "reply",
        body: "answer",
        attachments: [],
      },
    });
    [start, stream, comment, finish, reply].forEach((delta) => apply(replica, delta));
    const snapshot = replica.snapshot(replica.currentVersion("main"));
    expect(snapshot.transcript.text).toBe("你好🙂");
    expect(snapshot.sections.length).toBe(1);
    expect(snapshot.comments.get("comment")?.entries.length).toBe(2);
    expect(resolveAnchor(replica.graph, anchor, snapshot.version).ranges).toEqual([
      { start: 6, end: 10 },
    ]);
    const invalid = change("bad", 1, [reply.id], {
      kind: "comment",
      data: {
        operation: "created",
        comment_id: "bad",
        anchor: { ...anchor, quote: "wrong" },
        body: "",
        attachments: [],
      },
    });
    expect(() => apply(replica, invalid)).toThrow();
  });

  it("merges concurrent file moves and keeps deleted code comment history", () => {
    const replica = new ThreadReplica("thread");
    const buffer = change("a", 1, [], {
      kind: "text",
      data: { operation: "created", buffer_id: "buffer", text: "abc" },
    });
    const tree = change("a", 2, [buffer.id], {
      kind: "worktree",
      data: {
        operation: "created",
        worktree_id: "tree",
        project_id: "project",
        base_commit: "abc123",
      },
    });
    const file = change("a", 3, [tree.id], {
      kind: "worktree",
      data: {
        operation: "file_created",
        worktree_id: "tree",
        path: "src/main.ts",
        buffer_id: "buffer",
      },
    });
    const left = change("b", 1, [file.id], {
      kind: "worktree",
      data: {
        operation: "path_moved",
        worktree_id: "tree",
        from: "src/main.ts",
        to: "src/left.ts",
      },
    });
    const right = change("c", 1, [file.id], {
      kind: "worktree",
      data: {
        operation: "path_moved",
        worktree_id: "tree",
        from: "src/main.ts",
        to: "src/right.ts",
      },
    });
    const anchor: SelectionAnchor = {
      version: [file.id],
      target: {
        kind: "file",
        worktree_id: "tree",
        path: "src/main.ts",
        buffer_id: "buffer",
        side: "before",
      },
      range: { start: 1, end: 2 },
      quote: "b",
    };
    const edit = change("d", 1, [file.id], {
      kind: "text",
      data: {
        operation: "edited",
        buffer_id: "buffer",
        based_on: [file.id],
        range: { start: 1, end: 2 },
        text: "",
      },
    });
    [buffer, tree, file, right, left, edit].forEach((delta) => apply(replica, delta));
    const snapshot = replica.snapshot(replica.currentVersion("main"));
    expect([...snapshot.worktrees.get("tree")!.files.keys()].sort()).toEqual([
      "src/left.ts",
      "src/right.ts",
    ]);
    expect(resolveAnchor(replica.graph, anchor, snapshot.version)).toEqual({
      quote: "b",
      ranges: [],
      deleted: true,
    });
    expect(replica.snapshot(anchor.version).buffers.get("buffer")?.text).toBe("abc");
  });

  it("exposes context usage, immutable verdicts and per-person seen state", () => {
    const replica = new ThreadReplica("thread");
    const buffer = change("a", 1, [], {
      kind: "text",
      data: { operation: "created", buffer_id: "buffer", text: "abc" },
    });
    const tree = change("a", 2, [buffer.id], {
      kind: "worktree",
      data: {
        operation: "created",
        worktree_id: "tree",
        project_id: "project",
        base_commit: "abc",
      },
    });
    const file = change("a", 3, [tree.id], {
      kind: "worktree",
      data: {
        operation: "file_created",
        worktree_id: "tree",
        path: "file.ts",
        buffer_id: "buffer",
      },
    });
    const seen = change("a", 4, [file.id], {
      kind: "review",
      data: {
        operation: "file_seen",
        worktree_id: "tree",
        path: "file.ts",
        version: [file.id],
        seen: true,
      },
    });
    const verdict = change("a", 5, [seen.id], {
      kind: "review",
      data: {
        operation: "verdict",
        review_id: "review",
        verdict: "approved",
        worktrees: [{ worktree_id: "tree", version: [file.id] }],
      },
    });
    const usage = change("a", 6, [verdict.id], {
      kind: "context_usage",
      data: {
        run_id: "run",
        model: "model",
        context_window: 1000,
        used_tokens: 700,
        compact_at: 800,
        automatic_compaction: true,
        breakdown: [{ category: "tool_outputs", tool_name: "terminal", bytes: 2048, tokens: 500 }],
      },
    });
    [buffer, tree, file, seen, verdict, usage].forEach((delta) => apply(replica, delta));
    const current = replica.snapshot([usage.id]);
    const at = (version: Version) => replica.snapshot(version);
    expect(isFileSeen(current, "person", "tree", "file.ts", at)).toBe(true);
    expect(isFileSeen(current, "other", "tree", "file.ts", at)).toBe(false);
    expect(current.usage.get("run")?.breakdown[0]?.bytes).toBe(2048);
    const noop = change("noop", 1, [usage.id], {
      kind: "text",
      data: {
        operation: "edited",
        buffer_id: "buffer",
        based_on: [usage.id],
        range: { start: 1, end: 1 },
        text: "",
      },
    });
    apply(replica, noop);
    expect(isFileSeen(replica.snapshot([noop.id]), "person", "tree", "file.ts", at)).toBe(true);
    const replace = change("a", 7, [usage.id], {
      kind: "text",
      data: {
        operation: "edited",
        buffer_id: "buffer",
        based_on: [usage.id],
        range: { start: 0, end: 3 },
        text: "abc",
      },
    });
    apply(replica, replace);
    const updated = replica.snapshot([replace.id]);
    expect(diffWorktree(current, updated, "tree")).toEqual([]);
    expect(isFileSeen(updated, "person", "tree", "file.ts", at)).toBe(false);
    const pinned = updated.reviews.find((review) => review.data.operation === "verdict");
    expect(pinned?.data.operation === "verdict" ? pinned.data.worktrees[0]?.version : []).toEqual([
      file.id,
    ]);
    const remove = change("a", 8, [replace.id], {
      kind: "worktree",
      data: { operation: "file_removed", worktree_id: "tree", path: "file.ts" },
    });
    apply(replica, remove);
    const anchor: SelectionAnchor = {
      version: [file.id],
      target: { kind: "file", worktree_id: "tree", path: "file.ts", buffer_id: "buffer" },
      range: { start: 0, end: 1 },
      quote: "a",
    };
    expect(resolveAnchor(replica.graph, anchor, [remove.id]).deleted).toBe(true);
  });

  it("path-copies B+ nodes without mutating or copying untouched branches", () => {
    let tree = new PersistentTree<number>();
    for (let index = 0; index < 1000; index++)
      tree = tree.set(String(index).padStart(4, "0"), index);
    const next = tree.set("0000", 42);
    expect(tree.get("0000")).toBe(0);
    expect(next.get("0000")).toBe(42);
    expect([...next.entries()].length).toBe(1000);
    if (tree.root.kind !== "branch" || next.root.kind !== "branch")
      throw new Error("Expected branches");
    expect(
      tree.root.children[tree.root.children.length - 1] ===
        next.root.children[next.root.children.length - 1],
    ).toBe(true);
  });
});
