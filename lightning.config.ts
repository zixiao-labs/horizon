import { defineConfig } from "@lightning-js/lightning";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Nasti 2.9's config loader shares a timestamp file between file workers.
    maxWorkers: 1,
  },
});
