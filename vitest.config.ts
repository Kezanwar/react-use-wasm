import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The demo (and so the shared MathExports contract) imports the package
      // by name. Point it at source for tests.
      "react-use-wasm": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
  },
  test: {
    // Default to node. DOM tests opt in with `// @vitest-environment jsdom`.
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    typecheck: {
      enabled: true,
      include: ["test/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },
  },
});
