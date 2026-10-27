import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative, not "/". The demo is deployed to GitHub Pages under
  // /react-use-wasm/, where an absolute "/math.wasm" would 404. Relative
  // keeps dev, `vite preview`, the Playwright suite and Pages all working
  // from one setting, and survives the repo being renamed.
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: { port: 5173 },
  // Vite already serves .wasm from public/ as `Content-Type: application/wasm`,
  // which is what lets the hooks take the WebAssembly.compileStreaming path.
  // Confirmed by the Playwright test in e2e/, which asserts the response
  // header on /math.wasm.
});
