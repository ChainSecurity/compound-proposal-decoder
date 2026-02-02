import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 300000, // 5 min timeout for simulations
    hookTimeout: 120000,
    globals: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
