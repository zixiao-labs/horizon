import { defineConfig } from "@nasti-toolchain/nasti";

export default defineConfig({
  target: "electron",
  framework: "react",
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    emptyOutDir: true,
    target: "es2022",
  },
  electron: {
    main: "src/electron/main.ts",
    preload: "src/electron/preload.ts",
    renderer: "src/renderer/index.html",
    mainFormat: "esm",
    preloadFormat: "cjs",
    nodeTarget: "node22",
    autoRestart: true,
    minVersion: 41,
    external: ["electron"],
  },
});
