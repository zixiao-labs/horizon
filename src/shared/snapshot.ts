import {
  canonicalVersion,
  compareStrings,
  deltaKey,
  type CausalGraph,
  type Delta,
  type JsonValue,
  type Version,
} from "./thread";
import type {
  CommentDelta,
  ContextUsage,
  EditArtifact,
  ProvenancedValue,
  ReviewDelta,
  SelectionAnchor,
} from "./collaboration";
import { PersistentTree } from "./persistent-tree";
import {
  appendFragments,
  byteLength,
  orderedDeltas,
  selectFragments,
  textIndex,
  TextMaterializer,
  type TextFragment,
  type TextSnapshot,
} from "./text-crdt";

export interface FileSnapshot {
  readonly buffer_id: string;
  readonly executable: boolean;
  readonly delta_id: Delta["id"];
}
export interface WorktreeSnapshot {
  readonly project_id: string;
  readonly base_commit: string;
  readonly files: ReadonlyMap<string, FileSnapshot>;
  readonly conflicts: ReadonlyMap<string, readonly FileSnapshot[]>;
  readonly commits: readonly JsonValue[];
}
export interface TranscriptSection {
  readonly delta_id: Delta["id"];
  readonly message_id: string;
  readonly content_kind: string;
  readonly content_index: number;
  readonly range: { readonly start: number; readonly end: number };
}
export interface CommentSnapshot {
  readonly anchor: SelectionAnchor;
  readonly entries: readonly {
    readonly id: string;
    readonly body: string;
    readonly identity_id: string;
    readonly attachments: Extract<CommentDelta, { operation: "created" }>["attachments"];
  }[];
  readonly resolved: boolean;
}
export interface ThreadSnapshot {
  readonly version: Version;
  readonly title: string;
  /** Multi-value registers retain concurrent values; last candidate is display winner. */
  readonly registers: PersistentTree<readonly ProvenancedValue[]>;
  readonly maps: PersistentTree<readonly ProvenancedValue[]>;
  readonly buffers: ReadonlyMap<string, TextSnapshot>;
  readonly worktrees: ReadonlyMap<string, WorktreeSnapshot>;
  readonly transcript: TextSnapshot;
  readonly sections: readonly TranscriptSection[];
  readonly messages: ReadonlyMap<string, JsonValue>;
  readonly tools: ReadonlyMap<string, readonly JsonValue[]>;
  readonly runs: ReadonlyMap<string, string>;
  readonly comments: ReadonlyMap<string, CommentSnapshot>;
  readonly reviews: readonly { readonly identity_id: string; readonly data: ReviewDelta }[];
  readonly usage: ReadonlyMap<string, ContextUsage>;
  readonly edits: readonly EditArtifact[];
}

export function validatePath(path: string): void {
  if (
    !path ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    /^[A-Za-z]:/.test(path)
  ) {
    throw new Error(`Not a canonical worktree-relative path: ${path}`);
  }
}

function messageText(message: JsonValue): string {
  if (!message || typeof message !== "object" || Array.isArray(message)) return "";
  const content = (message as { readonly content?: JsonValue }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return "";
      const block = part as { readonly text?: JsonValue; readonly thinking?: JsonValue };
      return typeof block.text === "string"
        ? block.text
        : typeof block.thinking === "string"
          ? block.thinking
          : "";
    })
    .join("");
}

export function materialize(graph: CausalGraph, version: Version): ThreadSnapshot {
  const { deltas } = orderedDeltas(graph, version);
  const text = new TextMaterializer(graph);
  let title = "";
  let registers = new PersistentTree<readonly ProvenancedValue[]>();
  let maps = new PersistentTree<readonly ProvenancedValue[]>();
  const buffers = new Map<string, TextSnapshot>();
  const worktrees = new Map<string, WorktreeSnapshot>();
  // Observed-remove path registers retain tombstones for concurrent renames.
  const fileDots = new Map<
    string,
    Map<string, { delta: Delta; file: FileSnapshot; removedBy: Delta[] }[]>
  >();
  const messages = new Map<string, JsonValue>();
  const messageStates = new Map<string, { finished: boolean; streamed: boolean }>();
  const tools = new Map<string, readonly JsonValue[]>();
  const runs = new Map<string, string>();
  const comments = new Map<string, CommentSnapshot>();
  const reviews: { identity_id: string; data: ReviewDelta }[] = [];
  const usage = new Map<string, ContextUsage>();
  const edits: EditArtifact[] = [];
  const fragments: TextFragment[] = [];
  const sections: TranscriptSection[] = [];
  let transcriptBytes = 0;
  const append = (
    delta: Delta,
    messageId: string,
    contentKind: string,
    index: number,
    content: string,
  ) => {
    const start = transcriptBytes;
    fragments.push(...appendFragments(delta, content));
    transcriptBytes += byteLength(content);
    sections.push({
      delta_id: delta.id,
      message_id: messageId,
      content_kind: contentKind,
      content_index: index,
      range: { start, end: transcriptBytes },
    });
  };
  const requirePast = (delta: Delta, referenced: Version) => {
    graph.validateVersion(referenced);
    if (!graph.dominates(delta.parents, referenced))
      throw new Error("Referenced version is not in the delta's causal past");
  };
  const put = (
    previous: readonly ProvenancedValue[] | undefined,
    delta: Delta,
    value: JsonValue,
  ) => [
    ...(previous ?? []).filter((candidate) => !graph.covers(delta.parents, candidate.delta_id)),
    { delta_id: delta.id, identity_id: delta.context.identity_id, value },
  ];
  for (const delta of deltas) {
    const payload = delta.payload;
    switch (payload.kind) {
      case "thread":
        title = payload.data.title;
        break;
      case "register":
        registers = registers.set(
          payload.data.register_id,
          put(registers.get(payload.data.register_id), delta, payload.data.value),
        );
        break;
      case "map": {
        const data = payload.data;
        const key = JSON.stringify([data.map_id, data.key]);
        if (data.operation === "put") maps = maps.set(key, put(maps.get(key), delta, data.value));
        else {
          requirePast(delta, data.observed);
          maps = maps.set(
            key,
            (maps.get(key) ?? []).filter(
              (candidate) => !graph.covers(data.observed, candidate.delta_id),
            ),
          );
        }
        break;
      }
      case "text":
        buffers.set(payload.data.buffer_id, text.at(payload.data.buffer_id, version));
        break;
      case "worktree": {
        const data = payload.data;
        if (data.operation === "created") {
          if (worktrees.has(data.worktree_id)) throw new Error("Worktree was created twice");
          worktrees.set(data.worktree_id, {
            project_id: data.project_id,
            base_commit: data.base_commit,
            files: new Map(),
            conflicts: new Map(),
            commits: [],
          });
          fileDots.set(data.worktree_id, new Map());
          break;
        }
        const tree = worktrees.get(data.worktree_id);
        if (!tree) throw new Error("Unknown worktree");
        const dots = fileDots.get(data.worktree_id)!;
        const visible = (path: string, at: Version) =>
          (dots.get(path) ?? []).filter(
            (dot) =>
              graph.covers(at, dot.delta.id) &&
              !dot.removedBy.some((removal) => graph.covers(at, removal.id)),
          );
        const remove = (path: string) =>
          visible(path, delta.parents).forEach((dot) => dot.removedBy.push(delta));
        const write = (path: string, file: Omit<FileSnapshot, "delta_id">) => {
          const previous = dots.get(path) ?? [];
          previous.push({ delta, file: { ...file, delta_id: delta.id }, removedBy: [] });
          dots.set(path, previous);
        };
        switch (data.operation) {
          case "file_created":
            validatePath(data.path);
            text.at(data.buffer_id, delta.parents);
            remove(data.path);
            write(data.path, { buffer_id: data.buffer_id, executable: false });
            break;
          case "file_removed":
            validatePath(data.path);
            remove(data.path);
            break;
          case "path_moved": {
            validatePath(data.from);
            validatePath(data.to);
            const source = visible(data.from, delta.parents);
            const file = source[source.length - 1]?.file;
            if (!file) throw new Error("Move source absent in its causal base");
            remove(data.from);
            remove(data.to);
            write(data.to, file);
            break;
          }
          case "executable_changed": {
            validatePath(data.path);
            const source = visible(data.path, delta.parents);
            const file = source[source.length - 1]?.file;
            if (!file) throw new Error("Unknown file");
            remove(data.path);
            write(data.path, { ...file, executable: data.executable });
            break;
          }
          case "commit_created":
            worktrees.set(data.worktree_id, { ...tree, commits: [...tree.commits, data] });
            continue;
        }
        const files = new Map<string, FileSnapshot>();
        const conflicts = new Map<string, readonly FileSnapshot[]>();
        for (const path of dots.keys()) {
          const candidates = visible(path, version).map((dot) => dot.file);
          if (candidates.length) files.set(path, candidates[candidates.length - 1]!);
          if (candidates.length > 1) conflicts.set(path, candidates);
        }
        worktrees.set(data.worktree_id, { ...tree, files, conflicts });
        break;
      }
      case "transcript": {
        const data = payload.data;
        if (data.operation === "message_started") {
          if (messageStates.has(data.message_id)) throw new Error("Message was started twice");
          messageStates.set(data.message_id, { finished: false, streamed: false });
        } else if (data.operation === "content_appended" || data.operation === "message_finished") {
          const state = messageStates.get(data.message_id);
          if (!state || state.finished) throw new Error("Message is absent or already finished");
          if (data.operation === "content_appended") {
            append(
              delta,
              data.message_id,
              data.content_kind,
              data.content_index ?? 0,
              data.content,
            );
            state.streamed = true;
          } else {
            if (!state.streamed)
              append(delta, data.message_id, "text", 0, messageText(data.message));
            messages.set(data.message_id, data.message);
            state.finished = true;
          }
        } else {
          const events = tools.get(data.tool_call_id) ?? [];
          tools.set(data.tool_call_id, [...events, data]);
        }
        break;
      }
      case "agent_run":
        runs.set(payload.data.run_id, payload.data.operation);
        break;
      case "comment": {
        const data = payload.data;
        const current = comments.get(data.comment_id);
        if (data.operation === "created") {
          if (current) throw new Error("Comment already exists");
          requirePast(delta, data.anchor.version);
          const historical = materialize(graph, data.anchor.version);
          const selected = anchorBuffer(historical, data.anchor);
          if (
            selectFragments(selected, data.anchor.range)
              .map((fragment) => fragment.text)
              .join("") !== data.anchor.quote
          )
            throw new Error("Comment quote does not match its historical selection");
          comments.set(data.comment_id, {
            anchor: data.anchor,
            entries: [
              {
                id: data.comment_id,
                body: data.body,
                identity_id: delta.context.identity_id,
                attachments: data.attachments,
              },
            ],
            resolved: false,
          });
        } else {
          if (!current) throw new Error("Unknown comment");
          if (data.operation === "resolved")
            comments.set(data.comment_id, { ...current, resolved: data.resolved });
          else {
            if (current.entries.some((entry) => entry.id === data.reply_id))
              throw new Error("Duplicate comment reply");
            comments.set(data.comment_id, {
              ...current,
              entries: [
                ...current.entries,
                {
                  id: data.reply_id,
                  body: data.body,
                  identity_id: delta.context.identity_id,
                  attachments: data.attachments,
                },
              ],
            });
          }
        }
        break;
      }
      case "review":
        if (payload.data.operation === "verdict")
          payload.data.worktrees.forEach((tree) => requirePast(delta, tree.version));
        else {
          validatePath(payload.data.path);
          requirePast(delta, payload.data.version);
        }
        reviews.push({ identity_id: delta.context.identity_id, data: payload.data });
        break;
      case "context_usage": {
        const data = payload.data;
        const counts = [
          data.context_window,
          data.used_tokens,
          ...data.breakdown.flatMap((part) => [
            part.bytes,
            ...(part.tokens === undefined ? [] : [part.tokens]),
          ]),
          ...(data.compact_at === undefined ? [] : [data.compact_at]),
        ];
        if (
          counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
          data.context_window === 0
        )
          throw new Error("Invalid context usage counters");
        usage.set(data.run_id, data);
        break;
      }
      case "edit_artifact":
        requirePast(delta, payload.data.before);
        requirePast(delta, payload.data.after);
        if (!graph.dominates(payload.data.after, payload.data.before))
          throw new Error("Edit artifact goes backward");
        payload.data.paths.forEach(validatePath);
        edits.push(payload.data);
        break;
    }
  }
  return {
    version: canonicalVersion(graph.reduce(version)),
    title,
    registers,
    maps,
    buffers,
    worktrees,
    transcript: { text: fragments.map((fragment) => fragment.text).join(""), fragments },
    sections,
    messages,
    tools,
    runs,
    comments,
    reviews,
    usage,
    edits,
  };
}

export function anchorBuffer(snapshot: ThreadSnapshot, anchor: SelectionAnchor): TextSnapshot {
  if (anchor.target.kind === "transcript") return snapshot.transcript;
  const tree = snapshot.worktrees.get(anchor.target.worktree_id);
  if (tree?.files.get(anchor.target.path)?.buffer_id !== anchor.target.buffer_id)
    throw new Error("Anchor file does not match its worktree");
  const buffer = snapshot.buffers.get(anchor.target.buffer_id);
  if (!buffer) throw new Error("Unknown anchor buffer");
  return buffer;
}

/** Deleted selections retain their captured quote and historical version. */
export function resolveAnchor(
  graph: CausalGraph,
  anchor: SelectionAnchor,
  next: Version,
): {
  readonly quote: string;
  readonly ranges: readonly { start: number; end: number }[];
  readonly deleted: boolean;
} {
  const historical = anchorBuffer(materialize(graph, anchor.version), anchor);
  const selected = new Map<string, { start: number; end: number }[]>();
  for (const fragment of selectFragments(historical, anchor.range)) {
    const key = deltaKey(fragment.origin);
    const spans = selected.get(key) ?? [];
    spans.push({ start: fragment.offset, end: fragment.offset + byteLength(fragment.text) });
    selected.set(key, spans);
  }
  for (const spans of selected.values()) spans.sort((a, b) => a.start - b.start);
  const latestSnapshot = materialize(graph, next);
  const target = anchor.target;
  const latest =
    target.kind === "transcript"
      ? latestSnapshot.transcript
      : [...(latestSnapshot.worktrees.get(target.worktree_id)?.files.values() ?? [])].some(
            (file) => file.buffer_id === target.buffer_id,
          )
        ? latestSnapshot.buffers.get(target.buffer_id)
        : undefined;
  const ranges: { start: number; end: number }[] = [];
  let offset = 0;
  for (const fragment of latest?.fragments ?? []) {
    if (fragment.deleted) continue;
    const end = offset + byteLength(fragment.text);
    const sourceEnd = fragment.offset + byteLength(fragment.text);
    const spans = selected.get(deltaKey(fragment.origin)) ?? [];
    let low = 0;
    let high = spans.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (spans[middle]!.end <= fragment.offset) low = middle + 1;
      else high = middle;
    }
    for (let index = low; index < spans.length; index++) {
      const source = spans[index]!;
      if (source.start >= sourceEnd) break;
      const start = Math.max(source.start, fragment.offset);
      const stop = Math.min(source.end, sourceEnd);
      if (start >= stop) continue;
      const mapped = {
        start: offset + start - fragment.offset,
        end: offset + stop - fragment.offset,
      };
      const previous = ranges[ranges.length - 1];
      if (previous?.end === mapped.start) previous.end = mapped.end;
      else ranges.push(mapped);
    }
    offset = end;
  }
  // Point comments track the preceding source endpoint, including its tombstone.
  if (anchor.range.start === anchor.range.end && latest) {
    const left = textIndex(historical).before(anchor.range.start);
    const endpoint = left ? left.offset + byteLength(left.text) : 0;
    let point = 0;
    for (const fragment of latest.fragments) {
      if (!left) break;
      if (
        fragment.origin.actor === left.origin.actor &&
        fragment.origin.sequence === left.origin.sequence &&
        fragment.offset < endpoint &&
        fragment.offset + byteLength(fragment.text) >= endpoint
      ) {
        if (!fragment.deleted) point += endpoint - fragment.offset;
        break;
      }
      if (!fragment.deleted) point += byteLength(fragment.text);
    }
    ranges.push({ start: point, end: point });
  }
  return { quote: anchor.quote, ranges, deleted: ranges.length === 0 };
}

export function sortedPaths(tree: WorktreeSnapshot): readonly string[] {
  return [...tree.files.keys()].sort(compareStrings);
}
