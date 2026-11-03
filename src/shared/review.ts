import type { ThreadSnapshot, FileSnapshot } from "./snapshot";
import { canonicalJson, compareStrings, type Version } from "./thread";
import type { EditArtifact } from "./collaboration";

export interface DiffLine {
  readonly kind: "context" | "removed" | "added";
  readonly text: string;
  readonly old_line?: number;
  readonly new_line?: number;
}
export interface FileDiff {
  readonly old_path?: string;
  readonly new_path?: string;
  readonly old_executable: boolean;
  readonly new_executable: boolean;
  readonly before: Version;
  readonly after: Version;
  readonly hunks: readonly {
    readonly old_start: number;
    readonly old_count: number;
    readonly new_start: number;
    readonly new_count: number;
    readonly lines: readonly DiffLine[];
  }[];
}

const lines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** A bounded-memory, exact replacement hunk, not a quadratic minimal-diff algorithm. */
function replacementHunks(before: string, after: string): FileDiff["hunks"] {
  if (before === after) return [];
  const oldLines = lines(before),
    newLines = lines(after);
  let prefix = 0,
    suffix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  )
    prefix++;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - suffix - 1] === newLines[newLines.length - suffix - 1]
  )
    suffix++;
  const start = Math.max(0, prefix - 3);
  const oldEnd = Math.min(oldLines.length, oldLines.length - suffix + 3);
  const newEnd = Math.min(newLines.length, newLines.length - suffix + 3);
  const output: DiffLine[] = [];
  for (let index = start; index < prefix; index++)
    output.push({
      kind: "context",
      text: oldLines[index]!,
      old_line: index + 1,
      new_line: index + 1,
    });
  for (let index = prefix; index < oldLines.length - suffix; index++)
    output.push({ kind: "removed", text: oldLines[index]!, old_line: index + 1 });
  for (let index = prefix; index < newLines.length - suffix; index++)
    output.push({ kind: "added", text: newLines[index]!, new_line: index + 1 });
  for (let index = 0; index < oldEnd - (oldLines.length - suffix); index++) {
    output.push({
      kind: "context",
      text: oldLines[oldLines.length - suffix + index]!,
      old_line: oldLines.length - suffix + index + 1,
      new_line: newLines.length - suffix + index + 1,
    });
  }
  return [
    {
      old_start: oldEnd === start ? start : start + 1,
      new_start: newEnd === start ? start : start + 1,
      old_count: oldEnd - start,
      new_count: newEnd - start,
      lines: output,
    },
  ];
}

export function diffWorktree(
  before: ThreadSnapshot,
  after: ThreadSnapshot,
  worktreeId: string,
): readonly FileDiff[] {
  const oldFiles = new Map(before.worktrees.get(worktreeId)?.files ?? []);
  const newFiles = new Map(after.worktrees.get(worktreeId)?.files ?? []);
  const pairs: {
    oldPath?: string;
    newPath?: string;
    oldFile?: FileSnapshot;
    newFile?: FileSnapshot;
  }[] = [];
  for (const [oldPath, oldFile] of oldFiles) {
    const samePath = newFiles.get(oldPath);
    const renamed = samePath
      ? undefined
      : [...newFiles].find(
          ([path, file]) => file.buffer_id === oldFile.buffer_id && !oldFiles.has(path),
        );
    const newPath = samePath ? oldPath : renamed?.[0];
    const newFile = samePath ?? renamed?.[1];
    pairs.push({ oldPath, newPath, oldFile, newFile });
    if (newPath) newFiles.delete(newPath);
  }
  for (const [newPath, newFile] of newFiles) pairs.push({ newPath, newFile });
  return pairs
    .sort((a, b) => compareStrings(a.newPath ?? a.oldPath!, b.newPath ?? b.oldPath!))
    .flatMap(({ oldPath, newPath, oldFile, newFile }) => {
      const oldText = oldFile ? before.buffers.get(oldFile.buffer_id)!.text : "";
      const newText = newFile ? after.buffers.get(newFile.buffer_id)!.text : "";
      if (oldPath === newPath && oldText === newText && oldFile?.executable === newFile?.executable)
        return [];
      return [
        {
          old_path: oldPath,
          new_path: newPath,
          old_executable: oldFile?.executable ?? false,
          new_executable: newFile?.executable ?? false,
          before: before.version,
          after: after.version,
          hunks: replacementHunks(oldText, newText),
        },
      ];
    });
}

export function editDiffs(
  artifact: EditArtifact,
  snapshot: (version: Version) => ThreadSnapshot,
): readonly FileDiff[] {
  return diffWorktree(
    snapshot(artifact.before),
    snapshot(artifact.after),
    artifact.worktree_id,
  ).filter(
    (diff) =>
      artifact.paths.includes(diff.old_path ?? "") || artifact.paths.includes(diff.new_path ?? ""),
  );
}

/** Per-person seen state is invalidated by any changed content/path/mode. */
export function isFileSeen(
  snapshot: ThreadSnapshot,
  identityId: string,
  worktreeId: string,
  path: string,
  at: (version: Version) => ThreadSnapshot,
): boolean {
  const latest = [...snapshot.reviews]
    .reverse()
    .find(
      (review) =>
        review.identity_id === identityId &&
        review.data.operation === "file_seen" &&
        review.data.worktree_id === worktreeId &&
        review.data.path === path,
    );
  if (!latest || latest.data.operation !== "file_seen" || !latest.data.seen) return false;
  const historical = at(latest.data.version);
  const oldFile = historical.worktrees.get(worktreeId)?.files.get(path);
  const newFile = snapshot.worktrees.get(worktreeId)?.files.get(path);
  if (!oldFile || !newFile || canonicalJson(oldFile) !== canonicalJson(newFile)) return false;
  return (
    canonicalJson(historical.buffers.get(oldFile.buffer_id)?.fragments) ===
    canonicalJson(snapshot.buffers.get(newFile.buffer_id)?.fragments)
  );
}
