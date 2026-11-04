# Horizon multiplayer agent coding environment client

[Server Repository](https://github.com/zixiao-labs/horizon-server)

## Data runtime (no UI)

Threads are passive causal histories. `AgentDriver` and `CollabDriver` explicitly
advance them; `AgentOrchestrator` composes only agent drivers.

- `src/shared/thread.ts`: driver batches, causal DAG, timeline frontiers.
- `src/shared/snapshot.ts`: version reification, multi-value registers, add-wins
  maps, logical worktrees, continuous transcript sections, comments, reviews and
  context usage.
- `src/shared/text-crdt.ts` and `text-index.ts`: run-fragment text CRDT with a
  byte-weighted B+ sequence index, observed deletion and historical positions.
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

In authenticated deployments first provision a newly created thread using
`ThreadAccessClient.create(threadId)`. It is an explicit HTTP operation, not a
side effect of connecting or replaying the outbox:

```ts
const access = new ThreadAccessClient(serverUrl, authenticatedFetch);
await access.create(threadId); // Idempotent for this thread's existing owner.
await access.grant(threadId, collaboratorIdentityId, "writer"); // Or "reader".
const members = await access.members(threadId);
await access.revoke(threadId, collaboratorIdentityId);
```

Supply a fetch implementation carrying the same signed session as the sync
socket; Node's default fetch does not share Electron's cookie jar automatically.
The owner alone can list/change membership. Readers can catch up and receive
live content, writers can also advance; the owner cannot be removed or changed
through this API. A thread includes all of its timelines/worktrees. Revocation
blocks subsequent reads/writes, closes an existing connection and preserves
unsent local outbox entries; it does not erase data already held by a peer.
The anonymous development mode bypasses these controls and is only for local
testing. Existing pre-ACL server threads require explicit administrator ownership
assignment; connecting never claims them.

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
- `checkpointReplay(threadId)` atomically captures the full causal graph, all
  timeline frontiers/fork bases/labels and the SQLite journal cursor.
  `checkpoint()` also refreshes this replay cache (at the current journal head,
  even when the named pin targets a historical version). On reopen, `load()`
  restores/validates the graph once per timeline and replays only later events;
  it does not revalidate every old driver transition. SHA-256 binds both the
  cursor and payload. Corrupt/unsupported caches fall back to the original log.
  Acknowledgements and original outbox request IDs still come from that log;
  checkpoints cannot turn pending operations into acknowledged operations.

`TextSnapshot.fragments` now contains contiguous source **runs**, not one object
per scalar. Use `selectFragments()` for exact UTF-8 ranges; selected runs are
clipped to the requested source spans. A run split never creates new source
identities. Comment resolution and seen-state comparisons use source spans,
not array boundaries. Emoji, combining characters, BOM and CRLF retain their
original bytes; a range/point inside a UTF-8 scalar is rejected.

### Current boundaries

This is a correctness-first reference data layer, not a copy of DeltaDB's
optimized diamond-types-inspired implementation. Text insertions are stored as
runs and split only at observed edit boundaries. The derived B+ index is
bulk-loaded per immutable snapshot; positioning is logarithmic in run count
plus decoding within the touched run. It is not yet a path-copying edit rope:
source-run splitting still scans runs, and historical snapshot reification still
visits causal deltas. Replay checkpoints skip repeated batch-level replay, but
retain the complete graph and still materialize each restored timeline once.
Maintenance callers explicitly choose when to checkpoint; there is no timer or
automatic log-pruning policy. A checkpoint is not permission to prune the log.

The matching server supports cross-instance live delivery through PostgreSQL
notifications plus five-second durable revision reconciliation. Sync v2 wire
messages and local SQLite schema are unchanged by the membership HTTP API.
Binary data transfer, causal log pruning and automatic checkout/Git management
remain separate work; no filesystem or landing action happens on approval.

Logical checkout metadata is ready; creating/syncing on-disk checkouts,
Git rebasing/landing, binary files, attachment transfer and renderer/IPC UI
integration are not implemented here. These data APIs require no new Monaco
model behavior. The Monaco fork's Git-package build fix and sourced-edit smoke
test are pinned by exact commit in `package.json` and `pnpm-lock.yaml`.
`pnpm-workspace.yaml` approves this dependency's preparation build so its
JavaScript and declaration entry points are generated during installation.
Building an attached Monaco worktree alone does not update this installed
dependency; a fork update requires publishing and explicitly updating the pin.

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

To also check catch-up and subsequent live delivery through a second service
process sharing the same disposable Postgres:

```sh
HORIZON_TEST_SYNC_URL=http://127.0.0.1:8787 \
HORIZON_TEST_SYNC_URL_2=http://127.0.0.1:8788 pnpm check
```

The integration test simulates losing an acknowledgment **after** the server
commits, reopens the client SQLite database, retries the same outbox IDs and
checks catch-up on a second replica. It is skipped without that environment
variable. SQLite is also checked with Electron's embedded Node runtime; no
native addon rebuilding is required.
