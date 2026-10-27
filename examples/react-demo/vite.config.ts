import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Vite already serves .wasm from public/ as `Content-Type: application/wasm`,
  // which is what lets the hooks take the WebAssembly.compileStreaming path.
  // Confirmed by the Playwright test in e2e/, which asserts the response
  // header on /math.wasm.
});
