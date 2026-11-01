import { useQuery } from "@tanstack/react-query";
import { VirtualList } from "./components/VirtualList";

const features = Array.from({ length: 1_000 }, (_, index) => ({
  id: index + 1,
  label: `TanStack virtual item ${index + 1}`,
}));

async function loadRuntime(): Promise<string> {
  return `Electron ${window.desktop.versions.electron} · ${window.desktop.platform}`;
}

export function App() {
  const runtime = useQuery({
    queryKey: ["runtime"],
    queryFn: loadRuntime,
  });

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">React · TanStack · Electron</p>
        <h1>Horizon</h1>
        <p className="subtitle">
          Nasti 驱动的桌面应用已经就绪，包含类型安全的 preload 桥接、Query 缓存和虚拟列表。
        </p>
        <span className="runtime">{runtime.data ?? "正在读取运行环境…"}</span>
      </header>

      <section className="panel" aria-labelledby="virtual-list-title">
        <div>
          <p className="eyebrow">TanStack Virtual</p>
          <h2 id="virtual-list-title">1,000 个按需渲染项目</h2>
        </div>
        <VirtualList items={features} />
      </section>
    </main>
  );
}
