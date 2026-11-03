import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import {
  ThreadReplica,
  type AdvanceOutcome,
  type DriverBatch,
  type RemoteAdvance,
  type Version,
} from "../shared/thread";
import type { CheckoutBinding } from "../shared/collaboration";
import type { PersistentTree, TreeNode } from "../shared/persistent-tree";
import type { ThreadAdvancePort } from "./drivers/types";

/** Main-process only. Each streaming chunk and its outbox entry commit together. */
export class LocalThreadStore {
  readonly #db: DatabaseSync;
  readonly #listeners = new Set<(batch: DriverBatch) => void>();
  readonly #replicas = new Map<string, { replica: ThreadReplica; sequence: number }>();

  constructor(filename: string) {
    this.#db = new DatabaseSync(filename, { timeout: 5000 });
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS local_schema(version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO local_schema VALUES(1);
      CREATE TABLE IF NOT EXISTS thread_events(
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL, request_id TEXT UNIQUE,
        kind TEXT NOT NULL CHECK(kind IN ('local', 'remote')),
        payload TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS thread_events_order ON thread_events(thread_id, sequence);
      CREATE TABLE IF NOT EXISTS checkout_bindings(
        worktree_id TEXT NOT NULL, machine_id TEXT NOT NULL, binding TEXT NOT NULL,
        PRIMARY KEY(worktree_id, machine_id)
      );
      CREATE TABLE IF NOT EXISTS tree_nodes(hash TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshot_pins(
        thread_id TEXT NOT NULL, name TEXT NOT NULL, version TEXT NOT NULL, roots TEXT NOT NULL,
        PRIMARY KEY(thread_id, name)
      );
    `);
  }

  close(): void {
    this.#db.close();
  }

  load(threadId: string): ThreadReplica {
    const cached = this.#replicas.get(threadId);
    const replica = cached?.replica.clone() ?? new ThreadReplica(threadId);
    let sequence = cached?.sequence ?? 0;
    for (const row of this.#db
      .prepare(
        "SELECT sequence, kind, payload FROM thread_events WHERE thread_id = ? AND sequence > ? ORDER BY sequence",
      )
      .all(threadId, sequence)) {
      if (row.kind === "local") replica.advance(JSON.parse(String(row.payload)) as DriverBatch);
      else replica.applyRemote(JSON.parse(String(row.payload)) as RemoteAdvance);
      sequence = Number(row.sequence);
    }
    this.#replicas.set(threadId, { replica, sequence });
    return replica.clone();
  }

  append(batch: DriverBatch, requestId: string): AdvanceOutcome {
    const outcome = this.#transaction(() => {
      const previous = this.#db
        .prepare("SELECT thread_id, payload FROM thread_events WHERE request_id = ?")
        .get(requestId);
      if (
        previous &&
        (previous.thread_id !== batch.thread_id || previous.payload !== JSON.stringify(batch))
      )
        throw new Error("Request ID reused for another batch");
      const staged = this.load(batch.thread_id);
      const outcome = staged.advance(batch);
      if (!previous)
        this.#db
          .prepare(
            "INSERT INTO thread_events(thread_id, request_id, kind, payload) VALUES(?, ?, 'local', ?)",
          )
          .run(batch.thread_id, requestId, JSON.stringify(batch));
      return outcome;
    });
    this.#listeners.forEach((listener) => listener(batch));
    return outcome;
  }

  onAppend(listener: (batch: DriverBatch) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  receive(threadId: string, update: RemoteAdvance): void {
    this.#transaction(() => {
      const staged = this.load(threadId);
      const outcome = staged.applyRemote(update);
      // A frontier-only update can advance another timeline without new dots.
      const previous = this.load(threadId).currentVersion(update.timeline_id);
      if (
        outcome.accepted.length ||
        JSON.stringify(previous) !== JSON.stringify(outcome.frontier)
      ) {
        this.#db
          .prepare(
            "INSERT INTO thread_events(thread_id, kind, payload, acknowledged) VALUES(?, 'remote', ?, 1)",
          )
          .run(threadId, JSON.stringify(update));
      }
    });
  }

  pending(threadId: string): readonly { requestId: string; batch: DriverBatch }[] {
    return this.#db
      .prepare(
        "SELECT request_id, payload FROM thread_events WHERE thread_id = ? AND kind = 'local' AND acknowledged = 0 ORDER BY sequence",
      )
      .all(threadId)
      .map((row) => ({
        requestId: String(row.request_id),
        batch: JSON.parse(String(row.payload)) as DriverBatch,
      }));
  }

  acknowledge(threadId: string, requestId: string): void {
    this.#db
      .prepare("UPDATE thread_events SET acknowledged = 1 WHERE thread_id = ? AND request_id = ?")
      .run(threadId, requestId);
  }

  bindCheckout(binding: CheckoutBinding): void {
    const previous = this.checkout(binding.worktree_id, binding.machine_id);
    if (previous?.locked && JSON.stringify(previous) !== JSON.stringify(binding))
      throw new Error("Checkout location is locked after first use");
    this.#db
      .prepare(
        "INSERT INTO checkout_bindings VALUES(?, ?, ?) ON CONFLICT(worktree_id, machine_id) DO UPDATE SET binding = excluded.binding",
      )
      .run(binding.worktree_id, binding.machine_id, JSON.stringify(binding));
  }

  checkout(worktreeId: string, machineId: string): CheckoutBinding | undefined {
    const row = this.#db
      .prepare("SELECT binding FROM checkout_bindings WHERE worktree_id = ? AND machine_id = ?")
      .get(worktreeId, machineId);
    return row ? (JSON.parse(String(row.binding)) as CheckoutBinding) : undefined;
  }

  /** Content-addressed immutable B+ pages, separate from the replay log. */
  saveTree<V>(tree: PersistentTree<V>): string {
    const save = (node: TreeNode<V>): string => {
      const payload = JSON.stringify(
        node.kind === "leaf" ? node : { kind: "branch", children: node.children.map(save) },
      );
      const hash = createHash("sha256").update(payload).digest("hex");
      this.#db.prepare("INSERT OR IGNORE INTO tree_nodes VALUES(?, ?)").run(hash, payload);
      return hash;
    };
    return this.#transaction(() => save(tree.root));
  }

  readTree<V>(hash: string): TreeNode<V> {
    const row = this.#db.prepare("SELECT payload FROM tree_nodes WHERE hash = ?").get(hash);
    if (!row) throw new Error(`Missing tree node ${hash}`);
    const payload = String(row.payload);
    if (createHash("sha256").update(payload).digest("hex") !== hash)
      throw new Error("Corrupt tree node");
    const node = JSON.parse(payload) as
      | { kind: "leaf"; entries: readonly (readonly [string, V])[] }
      | { kind: "branch"; children: readonly string[] };
    return node.kind === "leaf"
      ? node
      : { kind: "branch", children: node.children.map((child) => this.readTree<V>(child)) };
  }

  pin(threadId: string, name: string, version: Version, roots: readonly string[] = []): void {
    this.#transaction(() => {
      this.load(threadId).snapshot(version);
      roots.forEach((root) => this.readTree(root));
      this.#db
        .prepare(
          "INSERT INTO snapshot_pins VALUES(?, ?, ?, ?) ON CONFLICT(thread_id, name) DO UPDATE SET version = excluded.version, roots = excluded.roots",
        )
        .run(threadId, name, JSON.stringify(version), JSON.stringify(roots));
    });
  }

  checkpoint(threadId: string, name: string, version: Version): void {
    const snapshot = this.load(threadId).snapshot(version);
    const roots = [this.saveTree(snapshot.registers), this.saveTree(snapshot.maps)];
    this.pin(threadId, name, version, roots);
  }

  pinned(threadId: string, name: string): Version | undefined {
    const row = this.#db
      .prepare("SELECT version FROM snapshot_pins WHERE thread_id = ? AND name = ?")
      .get(threadId, name);
    return row ? (JSON.parse(String(row.version)) as Version) : undefined;
  }

  unpin(threadId: string, name: string): void {
    this.#db
      .prepare("DELETE FROM snapshot_pins WHERE thread_id = ? AND name = ?")
      .run(threadId, name);
  }

  /** Collect only unpinned snapshot pages. Never prune causal history/outbox. */
  compact(): number {
    return this.#transaction(() => {
      const reachable = new Set<string>();
      const visit = (hash: string) => {
        if (reachable.has(hash)) return;
        reachable.add(hash);
        const row = this.#db.prepare("SELECT payload FROM tree_nodes WHERE hash = ?").get(hash);
        if (!row) throw new Error("Pinned snapshot page missing");
        const node = JSON.parse(String(row.payload)) as { kind: string; children?: string[] };
        if (node.kind === "branch") node.children!.forEach(visit);
      };
      for (const row of this.#db.prepare("SELECT roots FROM snapshot_pins").all())
        (JSON.parse(String(row.roots)) as string[]).forEach(visit);
      let removed = 0;
      for (const row of this.#db.prepare("SELECT hash FROM tree_nodes").all()) {
        if (!reachable.has(String(row.hash)))
          removed += Number(
            this.#db.prepare("DELETE FROM tree_nodes WHERE hash = ?").run(row.hash!).changes,
          );
      }
      return removed;
    });
  }

  #transaction<T>(operation: () => T): T {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }
}

/** A shared local advance port for AgentDriver and user/collaboration edits. */
export class DurableAdvancePort implements ThreadAdvancePort {
  readonly #store: LocalThreadStore;
  readonly threadId: string;

  constructor(store: LocalThreadStore, threadId: string) {
    this.#store = store;
    this.threadId = threadId;
  }

  currentVersion(timelineId: string): Version {
    return this.#store.load(this.threadId).currentVersion(timelineId);
  }

  async advance(batch: DriverBatch): Promise<AdvanceOutcome> {
    if (batch.thread_id !== this.threadId) throw new Error("Advance port thread mismatch");
    return this.#store.append(batch, crypto.randomUUID());
  }
}
