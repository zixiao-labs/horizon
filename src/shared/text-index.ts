import type { ByteRange } from "./collaboration";
import { deltaKey } from "./thread";
import type { TextFragment } from "./text-crdt";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
export const byteLength = (text: string): number => encoder.encode(text).length;

/** Reject byte positions inside a scalar rather than silently replacing it. */
export function byteSlice(text: string, start: number, end: number): string {
  return decoder.decode(encoder.encode(text).subarray(start, end));
}

export function lastFragmentId(fragment: TextFragment): string {
  const last = fragment.text.slice(/[\uDC00-\uDFFF]/.test(fragment.text.slice(-1)) ? -2 : -1);
  return `${deltaKey(fragment.origin)}@${fragment.offset + byteLength(fragment.text) - byteLength(last)}`;
}

export function sliceFragment(fragment: TextFragment, start: number, end: number): TextFragment {
  const offset = fragment.offset + start;
  return {
    ...fragment,
    id: `${deltaKey(fragment.origin)}@${offset}`,
    offset,
    text: byteSlice(fragment.text, start, end),
    left:
      start === 0
        ? fragment.left
        : lastFragmentId({
            ...fragment,
            text: byteSlice(fragment.text, 0, start),
          }),
  };
}

type Entry = { readonly fragment: TextFragment; readonly bytes: number };
type Node = {
  readonly bytes: number;
} & (
  | { readonly kind: "leaf"; readonly entries: readonly Entry[] }
  | { readonly kind: "branch"; readonly children: readonly Node[] }
);
const capacity = 16;

/**
 * Immutable, bulk-loaded B+ sequence index. Branch byte summaries skip whole
 * subtrees (including tombstones); only intersecting source runs are decoded.
 * Editing rebuilds this derived index, never changes a historical root.
 */
export class TextIndex {
  readonly root: Node;

  constructor(fragments: readonly TextFragment[]) {
    const entries = fragments.map((fragment) => ({
      fragment,
      bytes: fragment.deleted ? 0 : byteLength(fragment.text),
    }));
    let level: Node[] = [];
    for (let offset = 0; offset < entries.length; offset += capacity) {
      const page = entries.slice(offset, offset + capacity);
      level.push({
        kind: "leaf",
        entries: page,
        bytes: page.reduce((n, entry) => n + entry.bytes, 0),
      });
    }
    while (level.length > 1) {
      const next: Node[] = [];
      for (let offset = 0; offset < level.length; offset += capacity) {
        const children = level.slice(offset, offset + capacity);
        next.push({
          kind: "branch",
          children,
          bytes: children.reduce((n, child) => n + child.bytes, 0),
        });
      }
      level = next;
    }
    this.root = level[0] ?? { kind: "leaf", entries: [], bytes: 0 };
  }

  #locate(offset: number): { fragment: TextFragment; start: number } {
    let node = this.root;
    let start = 0;
    while (node.kind === "branch") {
      const child = node.children.find((candidate) => {
        if (offset < start + candidate.bytes) return true;
        start += candidate.bytes;
        return false;
      });
      if (!child) throw new Error("Position outside buffer");
      node = child;
    }
    for (const entry of node.entries) {
      if (offset < start + entry.bytes) return { fragment: entry.fragment, start };
      start += entry.bytes;
    }
    throw new Error("Position outside buffer");
  }

  before(offset: number): TextFragment | undefined {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > this.root.bytes)
      throw new Error("Invalid UTF-8 byte position");
    if (offset === 0) return undefined;
    const { fragment, start } = this.#locate(offset - 1);
    return sliceFragment(fragment, 0, offset - start);
  }

  select(range: ByteRange): readonly TextFragment[] {
    if (
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      range.start < 0 ||
      range.end < range.start ||
      range.end > this.root.bytes
    )
      throw new Error("Invalid UTF-8 byte range");
    // Even empty ranges must lie on scalar boundaries.
    this.before(range.start);
    this.before(range.end);
    const output: TextFragment[] = [];
    const visit = (node: Node, start: number) => {
      if (start >= range.end || start + node.bytes <= range.start) return;
      if (node.kind === "branch") {
        for (const child of node.children) {
          visit(child, start);
          start += child.bytes;
        }
      } else {
        for (const entry of node.entries) {
          const end = start + entry.bytes;
          if (entry.bytes && start < range.end && end > range.start)
            output.push(
              sliceFragment(
                entry.fragment,
                Math.max(0, range.start - start),
                Math.min(entry.bytes, range.end - start),
              ),
            );
          start = end;
        }
      }
    };
    visit(this.root, 0);
    return output;
  }
}
