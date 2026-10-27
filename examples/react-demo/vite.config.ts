import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
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
