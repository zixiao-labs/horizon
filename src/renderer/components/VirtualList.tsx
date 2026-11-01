import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

interface VirtualListItem {
  id: number;
  label: string;
}

interface VirtualListProps {
  items: readonly VirtualListItem[];
}

export function VirtualList({ items }: VirtualListProps) {
  const scrollElement = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement.current,
    estimateSize: () => 48,
    overscan: 8,
  });

  return (
    <div ref={scrollElement} className="list" role="list">
      <div className="list-content" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;

          return (
            <div
              className="list-row"
              key={item.id}
              role="listitem"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <span>{item.label}</span>
              <code>#{item.id.toString().padStart(4, "0")}</code>
            </div>
          );
        })}
      </div>
    </div>
  );
}
