import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 120000, // Long timeout for RPC calls
    hookTimeout: 60000,
    globals: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
