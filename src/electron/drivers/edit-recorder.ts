import type { Delta, DeltaPayload, DriverBatch, Version } from "../../shared/thread";
import type { EditArtifact } from "../../shared/collaboration";
import { editDiffs, type FileDiff } from "../../shared/review";
import { DurableAdvancePort, type LocalThreadStore } from "../local-store";
import type { AgentDriverIdentity } from "./types";

/** Tool adapter: records the exact before/after and returns reviewable edit output.
 * Filesystem access belongs to a checkout adapter, not to the passive replica.
 */
export class AgentEditRecorder {
  readonly #store: LocalThreadStore;
  readonly #identity: AgentDriverIdentity;

  constructor(store: LocalThreadStore, identity: AgentDriverIdentity) {
    this.#store = store;
    this.#identity = identity;
  }

  async apply(
    toolCallId: string,
    worktreeId: string,
    paths: readonly string[],
    edits: readonly DeltaPayload[],
  ): Promise<{ artifact: EditArtifact; diffs: readonly FileDiff[] }> {
    if (edits.some((edit) => edit.kind !== "text" && edit.kind !== "worktree"))
      throw new Error("Edit recorder accepts only text/worktree changes");
    const identity = this.#identity;
    const replica = this.#store.load(identity.threadId);
    const before = replica.currentVersion(identity.timelineId);
    // Each tool transaction owns a fresh actor namespace; it cannot reuse the
    // lifecycle driver's counter or collide with another simultaneous tool.
    const actor = crypto.randomUUID();
    let parents: Version = before;
    const deltas: Delta[] = [];
    const add = (payload: DeltaPayload) => {
      const id = { actor, sequence: deltas.length + 1 };
      deltas.push({
        id,
        parents,
        context: {
          driver_id: identity.driverId,
          driver_kind: "agent",
          actor_id: actor,
          identity_id: identity.identityId,
          run_id: identity.runId,
          tool_call_id: toolCallId,
        },
        payload,
      });
      parents = [id];
    };
    edits.forEach(add);
    const artifact: EditArtifact = {
      tool_call_id: toolCallId,
      worktree_id: worktreeId,
      before,
      after: parents,
      paths,
    };
    add({ kind: "edit_artifact", data: artifact });
    const batch: DriverBatch = {
      thread_id: identity.threadId,
      timeline_id: identity.timelineId,
      driver_id: identity.driverId,
      driver_kind: "agent",
      base: before,
      next: parents,
      deltas,
    };
    await new DurableAdvancePort(this.#store, identity.threadId).advance(batch);
    const updated = this.#store.load(identity.threadId);
    return { artifact, diffs: editDiffs(artifact, (version) => updated.snapshot(version)) };
  }
}
