import { describe, expect, it } from "@lightning-js/lightning";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalThreadStore } from "./local-store";
import { PersistentTree } from "../shared/persistent-tree";
import { AgentEditRecorder } from "./drivers/edit-recorder";
import { CollabDriver } from "./drivers/collab-driver";
import type { CollabTransport } from "./drivers/collab-driver";
import { ThreadReplica, type DriverBatch } from "../shared/thread";

const first: DriverBatch = {
  thread_id: "thread",
  timeline_id: "main",
  driver_id: "driver",
  driver_kind: "agent",
  base: [],
  next: [{ actor: "a", sequence: 3 }],
  deltas: [
    {
      id: { actor: "a", sequence: 1 },
      parents: [],
      context: { driver_id: "driver", driver_kind: "agent", actor_id: "a", identity_id: "person" },
      payload: { kind: "text", data: { operation: "created", buffer_id: "buffer", text: "old\n" } },
    },
    {
      id: { actor: "a", sequence: 2 },
      parents: [{ actor: "a", sequence: 1 }],
      context: { driver_id: "driver", driver_kind: "agent", actor_id: "a", identity_id: "person" },
      payload: {
        kind: "worktree",
        data: {
          operation: "created",
          worktree_id: "tree",
          project_id: "project",
          base_commit: "abc",
        },
      },
    },
    {
      id: { actor: "a", sequence: 3 },
      parents: [{ actor: "a", sequence: 2 }],
      context: { driver_id: "driver", driver_kind: "agent", actor_id: "a", identity_id: "person" },
      payload: {
        kind: "worktree",
        data: {
          operation: "file_created",
          worktree_id: "tree",
          path: "file.ts",
          buffer_id: "buffer",
        },
      },
    },
  ],
};

describe("local durable data", () => {
  it("recovers pending edits, exact diffs, pinned B+ pages and checkout bindings after reopen", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "horizon-local-"));
    const filename = path.join(directory, "local.sqlite");
    let store = new LocalThreadStore(filename);
    try {
      store.append(first, "first");
      store.append(first, "first");
      expect(store.pending("thread").length).toBe(1);
      const recorder = new AgentEditRecorder(store, {
        threadId: "thread",
        timelineId: "main",
        driverId: "driver",
        actorId: "tool",
        identityId: "person",
        runId: "run",
      });
      const result = await recorder.apply(
        "edit",
        "tree",
        ["file.ts"],
        [
          {
            kind: "text",
            data: {
              operation: "edited",
              buffer_id: "buffer",
              based_on: first.next,
              range: { start: 0, end: 3 },
              text: "new",
            },
          },
        ],
      );
      expect(result.diffs[0]?.hunks[0]?.lines.map((line) => [line.kind, line.text])).toEqual([
        ["removed", "old\n"],
        ["added", "new\n"],
      ]);
      const tree = new PersistentTree<number>().set("retained", 42);
      const root = store.saveTree(tree);
      store.pin("thread", "review", result.artifact.after, [root]);
      store.saveTree(new PersistentTree<number>().set("garbage", 0));
      expect(store.compact()).toBe(1);
      store.bindCheckout({
        worktree_id: "tree",
        machine_id: "machine",
        path: "/local/checkout",
        mode: "isolated",
        locked: true,
      });
      expect(() =>
        store.bindCheckout({
          worktree_id: "tree",
          machine_id: "machine",
          path: "/other",
          mode: "local",
          locked: true,
        }),
      ).toThrow();
      store.close();
      store = new LocalThreadStore(filename);
      expect(store.pending("thread").length).toBe(2);
      expect(store.load("thread").snapshot(result.artifact.after).buffers.get("buffer")?.text).toBe(
        "new\n",
      );
      expect(new PersistentTree<number>(store.readTree(root)).get("retained")).toBe(42);
      expect(store.pinned("thread", "review")).toEqual(result.artifact.after);
      expect(store.checkout("tree", "machine")?.path).toBe("/local/checkout");
      store.acknowledge("thread", "first");
      expect(store.pending("thread").length).toBe(1);
      expect(() => store.append({ ...first, next: [] }, "first")).toThrow();
      expect(store.pending("thread").length).toBe(1);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("retains a lost-ack outbox and retries the identical request ID", async () => {
    const store = new LocalThreadStore(":memory:");
    try {
      store.append(first, "stable-id");
      let fail = true;
      const sent: string[] = [];
      const transport: CollabTransport = {
        async connect() {},
        async close() {},
        onRemoteAdvance: () => () => {},
        async advance(batch, requestId) {
          sent.push(requestId!);
          if (fail) throw new Error("lost ack");
          return { accepted: batch.deltas.map((delta) => delta.id), frontier: batch.next };
        },
      };
      const driver = new CollabDriver(new ThreadReplica("thread"), transport, store);
      let rejected = false;
      try {
        await driver.start();
      } catch {
        rejected = true;
      }
      expect(rejected).toBe(true);
      expect(store.pending("thread").length).toBe(1);
      fail = false;
      await driver.start();
      expect(sent).toEqual(["stable-id", "stable-id"]);
      expect(store.pending("thread").length).toBe(0);
      await driver.stop();
    } finally {
      store.close();
    }
  });
});
