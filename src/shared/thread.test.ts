import { describe, expect, it } from "@lightning-js/lightning";
import {
  ThreadReplica,
  type Delta,
  type DriverBatch,
  type DriverId,
  type IdentityId,
  type RegisterId,
  type ThreadId,
  type TimelineId,
  type Version,
} from "./thread";

const threadId = "thread" as ThreadId;
const timelineId = "timeline" as TimelineId;
const driverId = "driver" as DriverId;
const identityId = "identity" as IdentityId;
const registerId = "register" as RegisterId;

function delta(sequence: number, parents: Version): Delta {
  return {
    id: { actor: "actor", sequence },
    parents,
    context: {
      actor_id: "actor",
      driver_id: driverId,
      driver_kind: "agent",
      identity_id: identityId,
    },
    payload: {
      kind: "register",
      data: { register_id: registerId, value: sequence },
    },
  };
}

function batch(base: Version, next: Version, deltas: readonly Delta[]): DriverBatch {
  return {
    thread_id: threadId,
    timeline_id: timelineId,
    driver_id: driverId,
    driver_kind: "agent",
    base,
    next,
    deltas,
  };
}

describe("ThreadReplica", () => {
  it("stays lazy until a driver explicitly advances it", () => {
    const thread = new ThreadReplica(threadId);
    const first = delta(1, []);

    expect(thread.graph.size).toBe(0);
    expect(thread.timeline(timelineId)).toBe(undefined);

    thread.advance(batch([], [first.id], [first]));

    expect(thread.graph.size).toBe(1);
    expect(thread.timeline(timelineId)?.frontier).toEqual([first.id]);
  });

  it("joins concurrent driver advances", () => {
    const thread = new ThreadReplica(threadId);
    const first = delta(1, []);
    const left = delta(2, [first.id]);
    const right = delta(3, [first.id]);

    thread.advance(batch([], [first.id], [first]));
    thread.advance(batch([first.id], [left.id], [left]));
    thread.advance(batch([first.id], [right.id], [right]));

    expect(thread.timeline(timelineId)?.frontier).toEqual([left.id, right.id]);
  });

  it("accepts a serde echo with reordered JSON keys and frontier dots", () => {
    const first = delta(1, []);
    const second = delta(2, []);
    const merge = delta(3, [second.id, first.id]);
    const thread = new ThreadReplica(threadId);
    thread.advance(batch([], [merge.id], [first, second, merge]));
    const echo = {
      payload: merge.payload,
      context: {
        identity_id: identityId,
        driver_kind: "agent" as const,
        driver_id: driverId,
        actor_id: "actor",
      },
      parents: [first.id, second.id],
      id: merge.id,
    };
    expect(
      thread.applyRemote({ timeline_id: timelineId, frontier: [merge.id], deltas: [echo] })
        .accepted,
    ).toEqual([]);
  });
});
