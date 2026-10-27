import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  // Deliberately off. tsup's treeshake pass is rollup, which strips
  // module-level directives and drops the "use client" banner below with a
  // warning. The package is tiny and marked sideEffects:false, so consumer
  // bundlers tree-shake it fine without this.
  treeshake: false,
  target: "es2022",
  // react stays external; it is a peer dependency, never bundled.
  external: ["react"],
  // Required for the Next.js App Router: these are client-only hooks.
  // test/dist-output.test.ts asserts it survives into dist.
  banner: { js: '"use client";' },
  outExtension: ({ format }) => ({ js: format === "esm" ? ".js" : ".cjs" }),
});
