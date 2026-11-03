# Horizon multiplayer agent coding environment client

[Server Repository](https://github.com/zixiao-labs/horizon-server)

## Data runtime (no UI)

Threads are passive causal histories. `AgentDriver` and `CollabDriver` explicitly
advance them; `AgentOrchestrator` composes only agent drivers.

- `src/shared/thread.ts`: driver batches, causal DAG, timeline frontiers.
- `src/shared/snapshot.ts`: version reification, multi-value registers, add-wins
  maps, logical worktrees, continuous transcript sections, comments, reviews and
  context usage.
- `src/shared/text-crdt.ts`: reference text CRDT using stable source fragments,
  observed deletion, UTF-8 ranges and historical position translation.
- `src/shared/review.ts`: version-pinned file diffs and per-person seen state.
- `src/electron/local-store.ts`: main-process SQLite WAL journal, durable outbox,
  checkout bindings, content-addressed B+ pages, version pins and safe page GC.

### Wire the Drivers

```ts
const store = new LocalThreadStore(databasePath);
const advance = new DurableAdvancePort(store, threadId);
const agents = new PiAgentDriverFactory(createPiAgent, advance);
const transport = new WebSocketCollabTransport(syncUrl, () => [
  { timeline_id: timelineId, known: store.load(threadId).currentVersion(timelineId) },
]);
const collab = new CollabDriver(store.load(threadId), transport, store);
await collab.start();
```

Use the same store/advance port for all drivers for a thread. Each awaited Pi
streaming event commits locally before returning. While collaboration is running,
new local batches trigger outbox flushing. Disconnections retain pending batches;
`start()`/`flush()` retries their original request IDs. A successful local commit
does **not** imply a server acknowledgment. `pending()` and `syncError` expose
that distinction without a UI dependency. Fresh actor IDs are required for fresh
Pi driver instances; a run is not resumed by resetting its sequence counter.

### Interfaces for future UI and tools

- `store.load(threadId).snapshot(version)` reads a historical version without
  moving a timeline. Transcript sections map byte ranges to source delta,
  message, content kind and content-block index; final messages do not duplicate
  streamed text.
- `SelectionAnchor` stores the exact version, selection/point and captured
  quote. File selections also identify worktree, path, buffer and optional diff
  side. `resolveAnchor()` translates surviving source fragments and preserves
  the historical quote when the file or selected code has been deleted.
- Comments/replies retain author identity and attachment references. Attachment
  references are metadata, not an implemented binary upload service.
- `AgentEditRecorder.apply()` atomically records text/worktree edits and an
  `EditArtifact`, and returns structured `FileDiff[]`. Checkout/file tools must
  use this adapter to produce versioned edit output. It does not run arbitrary
  filesystem tools or infer before-images after an external edit.
- `ReviewBase`, pinned verdicts and `isFileSeen()` support future review UI.
  Approval never applies changes. Seen state is per authenticated identity and
  is invalidated by new source fragments, even if the resulting text is equal.
- `PiAgentDriver.recordContextUsage()` accepts exact model/tokenizer counters:
  context capacity, used tokens, compaction threshold, automatic compaction and
  byte/token category/tool breakdown. It does not guess tokens from bytes or
  run compaction automatically.
- `CheckoutBinding` is machine-local SQLite data (isolated/local/Git-worktree
  mode, path, locked-after-use). Absolute paths are never sent to the server.
  Logical worktrees are flat path registers; concurrent puts/renames retain
  conflicts rather than creating directory cycles.
- `checkpoint()`, `pin()`, `pinned()` and `compact()` manage immutable B+ pages.
  GC removes only unpinned derived pages, **never** causal history or pending
  operations, so comments, review snapshots and offline peers remain valid.

### Current boundaries

This is a correctness-first reference data layer, not a copy of DeltaDB's
optimized diamond-types-inspired implementation. Text fragments are currently
Unicode scalars and position lookup/reification still performs linear scans.
The B+ store currently backs register/map checkpoints; run-coalesced text
indexing, checkpoint-accelerated replay and causally safe log pruning remain
performance work. A checkpoint is not permission to prune the operation log.

Logical checkout metadata is ready; creating/syncing on-disk checkouts,
Git rebasing/landing, binary files, attachment transfer and renderer/IPC UI
integration are not implemented here. No Monaco change is needed for these
APIs; the existing Git-pinned Monaco dependency is unchanged.

## Validation

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For the real SQLite → WebSocket → Postgres test, start the matching server with
`HORIZON_ALLOW_ANONYMOUS=true` against a disposable Postgres, then run:

```sh
HORIZON_TEST_SYNC_URL=http://127.0.0.1:8787 pnpm test
```

The integration test simulates losing an acknowledgment **after** the server
commits, reopens the client SQLite database, retries the same outbox IDs and
checks catch-up on a second replica. It is skipped without that environment
variable. SQLite is also checked with Electron's embedded Node runtime; no
native addon rebuilding is required.
