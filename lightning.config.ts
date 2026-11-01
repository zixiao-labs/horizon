import { defineConfig } from "@lightning-js/lightning";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
