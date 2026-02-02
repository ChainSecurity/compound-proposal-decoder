import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts", "src/simulator.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  bundle: true,
  // Don't bundle node_modules - let them be resolved at runtime
  packages: "external",
});
