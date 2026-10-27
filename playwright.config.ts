import { defineConfig, devices } from "@playwright/test";

const PORT = 5174;
const SUBPATH_PORT = 4178;
const baseURL = `http://localhost:${PORT}`;

/**
 * These are the only tests that exercise the real thing: a module Worker
 * created from a Blob URL, and a WebAssembly.Module structured-cloned across
 * the thread boundary. jsdom can do neither.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"]],
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // The demo resolves `react-use-wasm` through the workspace link to
      // dist/, so the package has to be built first.
      command: `pnpm build && pnpm --filter react-use-wasm-demo exec vite --port ${PORT} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
    },
    {
      // A production build served from a sub-directory, the way GitHub
      // Pages does. See e2e/subpath.spec.ts.
      command: `pnpm --filter react-use-wasm-demo build && node scripts/serve-subpath.mjs`,
      url: `http://localhost:${SUBPATH_PORT}/react-use-wasm/`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
    },
  ],
});
