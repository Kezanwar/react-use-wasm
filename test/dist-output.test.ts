import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the published artefact. Run `pnpm build` first; these skip if dist
 * is absent so `vitest` alone still works on a clean checkout.
 */

const root = process.cwd();
const dist = (f: string) => resolve(root, "dist", f);
const built = existsSync(dist("index.js"));

describe.skipIf(!built)("dist", () => {
  it('starts both bundles with "use client"', () => {
    // Next.js App Router only treats a module as client code if the
    // directive is the very first statement. tsup's treeshake pass silently
    // strips it, which is why treeshake is off in tsup.config.ts.
    for (const file of ["index.js", "index.cjs"]) {
      const first = readFileSync(dist(file), "utf8").split("\n")[0]!.trim();
      expect(first, file).toBe('"use client";');
    }
  });

  it("ships type declarations for both module formats", () => {
    expect(existsSync(dist("index.d.ts"))).toBe(true);
    expect(existsSync(dist("index.d.cts"))).toBe(true);
  });

  it("declares every public export in the types", () => {
    const types = readFileSync(dist("index.d.ts"), "utf8");
    for (const name of [
      "useWasm",
      "useWasmWorker",
      "clearWasmCache",
      "WASM_WORKER_SOURCE",
      "UseWasmOptions",
      "UseWasmResult",
      "UseWasmState",
      "UseWasmWorkerOptions",
      "UseWasmWorkerResult",
      "UseWasmWorkerState",
      "WasmFunctionKeys",
    ]) {
      expect(types, name).toContain(name);
    }
  });

  it("keeps react external", () => {
    expect(readFileSync(dist("index.js"), "utf8")).toMatch(/from ["']react["']/);
    expect(readFileSync(dist("index.cjs"), "utf8")).toMatch(/require\(["']react["']\)/);
    // A bundled React would be orders of magnitude bigger than this.
    expect(readFileSync(dist("index.js")).byteLength).toBeLessThan(50_000);
  });

  it("has no runtime dependencies", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.peerDependencies).toEqual({ react: ">=18" });
    expect(pkg.sideEffects).toBe(false);
    // llm.md ships alongside dist: a brief about the package, written for
    // a model. README and LICENSE are included by npm regardless.
    expect(pkg.files).toEqual(["dist", "llm.md"]);
  });
});
