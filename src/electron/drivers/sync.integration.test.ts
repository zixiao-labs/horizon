import { expect, it } from "@lightning-js/lightning";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ThreadReplica,
  type Delta,
  type DeltaPayload,
  type DriverBatch,
  type Version,
} from "../../shared/thread";
import { LocalThreadStore } from "../local-store";
import { CollabDriver, type CollabTransport } from "./collab-driver";
import { WebSocketCollabTransport } from "./websocket-collab-transport";
import { AgentEditRecorder } from "./edit-recorder";

const integration = process.env.HORIZON_TEST_SYNC_URL ? it : it.skip;

integration(
  "replays SQLite streaming outbox through real Postgres after an acknowledged write loses its ack",
  async () => {
    const baseUrl = process.env.HORIZON_TEST_SYNC_URL!;
    const identity = (await (await fetch(`${baseUrl}/auth/session`)).json()) as { id: string };
    const threadId = crypto.randomUUID(),
      timelineId = crypto.randomUUID(),
      actor = crypto.randomUUID();
    const driverId = crypto.randomUUID(),
      messageId = crypto.randomUUID();
    const url = `${baseUrl.replace(/^http/, "ws")}/threads/${threadId}/sync`;
    const directory = mkdtempSync(path.join(tmpdir(), "horizon-sync-"));
    const filename = path.join(directory, "local.sqlite");
    let store = new LocalThreadStore(filename);
    const transports: WebSocketCollabTransport[] = [];
    const second = new LocalThreadStore(":memory:");
    let collab: CollabDriver | undefined;
    let observer: CollabDriver | undefined;
    try {
      let previous: Version = [];
      let sequence = 0;
      const payloads: DeltaPayload[] = [
        {
          kind: "transcript",
          data: { operation: "message_started", message_id: messageId, role: "assistant" },
        },
        {
          kind: "transcript",
          data: {
            operation: "content_appended",
            message_id: messageId,
            content_kind: "text",
            content_index: 0,
            content: "你好",
          },
        },
        {
          kind: "transcript",
          data: {
            operation: "content_appended",
            message_id: messageId,
            content_kind: "text",
            content_index: 0,
            content: "🙂",
          },
        },
        {
          kind: "transcript",
          data: {
            operation: "message_finished",
            message_id: messageId,
            message: { content: "你好🙂" },
          },
        },
      ];
      const append = (payload: DeltaPayload) => {
        const id = { actor, sequence: ++sequence };
        const delta: Delta = {
          id,
          parents: previous,
          context: {
            actor_id: actor,
            driver_id: driverId,
            driver_kind: "agent",
            identity_id: identity.id,
          },
          payload,
        };
        const batch: DriverBatch = {
          thread_id: threadId,
          timeline_id: timelineId,
          driver_id: driverId,
          driver_kind: "agent",
          base: previous,
          next: [id],
          deltas: [delta],
        };
        store.append(batch, `stream-${sequence}`);
        previous = [id];
      };
      payloads.forEach(append);
      const bufferId = crypto.randomUUID(),
        worktreeId = crypto.randomUUID(),
        runId = crypto.randomUUID();
      append({ kind: "text", data: { operation: "created", buffer_id: bufferId, text: "old\n" } });
      append({
        kind: "worktree",
        data: {
          operation: "created",
          worktree_id: worktreeId,
          project_id: crypto.randomUUID(),
          base_commit: "abc123",
        },
      });
      append({
        kind: "worktree",
        data: {
          operation: "file_created",
          worktree_id: worktreeId,
          path: "file.ts",
          buffer_id: bufferId,
        },
      });
      const fileVersion = previous;
      const recorder = new AgentEditRecorder(store, {
        threadId,
        timelineId,
        driverId,
        actorId: actor,
        identityId: identity.id,
        runId,
      });
      const edit = await recorder.apply(
        "edit",
        worktreeId,
        ["file.ts"],
        [
          {
            kind: "text",
            data: {
              operation: "edited",
              buffer_id: bufferId,
              based_on: fileVersion,
              range: { start: 0, end: 3 },
              text: "new",
            },
          },
        ],
      );
      previous = store.load(threadId).currentVersion(timelineId);
      append({
        kind: "comment",
        data: {
          operation: "created",
          comment_id: "review-comment",
          anchor: {
            version: fileVersion,
            range: { start: 0, end: 3 },
            quote: "old",
            target: {
              kind: "file",
              worktree_id: worktreeId,
              path: "file.ts",
              buffer_id: bufferId,
              side: "before",
            },
          },
          body: "old code",
          attachments: [],
        },
      });
      append({
        kind: "review",
        data: {
          operation: "verdict",
          review_id: "review",
          verdict: "approved",
          worktrees: [{ worktree_id: worktreeId, version: edit.artifact.after }],
        },
      });
      append({
        kind: "context_usage",
        data: {
          run_id: runId,
          model: "test-model",
          context_window: 1000,
          used_tokens: 100,
          automatic_compaction: false,
          breakdown: [{ category: "messages", bytes: 10, tokens: 5 }],
        },
      });
      const pendingCount = store.pending(threadId).length;
      const graphSize = store.load(threadId).graph.size;
      const first = new WebSocketCollabTransport(url, [{ timeline_id: timelineId, known: [] }]);
      transports.push(first);
      const loseAck: CollabTransport = {
        connect: () => first.connect(),
        close: () => first.close(),
        onRemoteAdvance: (listener) => first.onRemoteAdvance(listener),
        async advance(batch, requestId) {
          await first.advance(batch, requestId);
          throw new Error("simulated lost ack after durable server commit");
        },
      };
      collab = new CollabDriver(new ThreadReplica(threadId), loseAck, store);
      let failed = false;
      try {
        await collab.start();
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
      expect(store.pending(threadId).length).toBe(pendingCount);
      await collab.stop();
      store.close();
      store = new LocalThreadStore(filename);
      const retry = new WebSocketCollabTransport(url, () => [
        { timeline_id: timelineId, known: store.load(threadId).currentVersion(timelineId) },
      ]);
      transports.push(retry);
      collab = new CollabDriver(new ThreadReplica(threadId), retry, store);
      await collab.start();
      expect(store.pending(threadId).length).toBe(0);
      const receiver = new WebSocketCollabTransport(url, [{ timeline_id: timelineId, known: [] }]);
      transports.push(receiver);
      const caughtUp = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("catch-up timed out")), 10_000);
        receiver.onRemoteAdvance((update) => {
          if (update.frontier.some((id) => id.actor === actor && id.sequence === sequence)) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      observer = new CollabDriver(new ThreadReplica(threadId), receiver, second);
      await observer.start();
      await caughtUp;
      const recovered = second.load(threadId);
      expect(recovered.graph.size).toBe(graphSize);
      const snapshot = recovered.snapshot(recovered.currentVersion(timelineId));
      expect(snapshot.transcript.text).toBe("你好🙂");
      expect(snapshot.buffers.get(bufferId)?.text).toBe("new\n");
      expect(snapshot.comments.get("review-comment")?.anchor.quote).toBe("old");
      expect(snapshot.edits.length).toBe(1);
      expect(snapshot.usage.get(runId)?.used_tokens).toBe(100);
    } finally {
      await collab?.stop();
      await observer?.stop();
      await Promise.all(transports.map((transport) => transport.close()));
      second.close();
      store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
