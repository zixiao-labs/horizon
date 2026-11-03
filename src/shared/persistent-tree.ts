const capacity = 16;

export type TreeNode<V> =
  | { readonly kind: "leaf"; readonly entries: readonly (readonly [string, V])[] }
  | { readonly kind: "branch"; readonly children: readonly TreeNode<V>[] };

function maximum<V>(node: TreeNode<V>): string {
  return node.kind === "leaf"
    ? node.entries[node.entries.length - 1]![0]
    : maximum(node.children[node.children.length - 1]!);
}

/** Immutable B+ tree: updates copy only a root-to-leaf path; values live in leaves. */
export class PersistentTree<V> {
  readonly root: TreeNode<V>;

  constructor(root: TreeNode<V> = { kind: "leaf", entries: [] }) {
    this.root = root;
  }

  get(key: string): V | undefined {
    let node = this.root;
    while (node.kind === "branch") {
      node =
        node.children.find((child) => key <= maximum(child)) ??
        node.children[node.children.length - 1]!;
    }
    return node.entries.find(([candidate]) => candidate === key)?.[1];
  }

  set(key: string, value: V): PersistentTree<V> {
    const insert = (node: TreeNode<V>): readonly TreeNode<V>[] => {
      if (node.kind === "leaf") {
        const entries = [...node.entries];
        const index = entries.findIndex(([candidate]) => candidate >= key);
        if (index < 0) entries.push([key, value]);
        else if (entries[index]![0] === key) entries[index] = [key, value];
        else entries.splice(index, 0, [key, value]);
        return entries.length <= capacity
          ? [{ kind: "leaf", entries }]
          : [
              { kind: "leaf", entries: entries.slice(0, capacity / 2) },
              { kind: "leaf", entries: entries.slice(capacity / 2) },
            ];
      }
      const children = [...node.children];
      let index = children.findIndex((child) => key <= maximum(child));
      if (index < 0) index = children.length - 1;
      children.splice(index, 1, ...insert(children[index]!));
      return children.length <= capacity
        ? [{ kind: "branch", children }]
        : [
            { kind: "branch", children: children.slice(0, capacity / 2) },
            { kind: "branch", children: children.slice(capacity / 2) },
          ];
    };
    const roots = insert(this.root);
    return new PersistentTree(roots.length === 1 ? roots[0] : { kind: "branch", children: roots });
  }

  *entries(): IterableIterator<readonly [string, V]> {
    const pending = [this.root];
    while (pending.length) {
      const node = pending.pop()!;
      if (node.kind === "leaf") yield* node.entries;
      else pending.push(...[...node.children].reverse());
    }
  }
}
