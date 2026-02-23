import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts", "src/tracker.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  bundle: true,
  packages: "external",
});
