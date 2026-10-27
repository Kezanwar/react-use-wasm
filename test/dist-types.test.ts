import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const root = process.cwd();
const dts = resolve(root, "dist/index.d.ts");

/**
 * Type-checks a consumer against the *built* declarations.
 *
 * Nothing else does. Everywhere else — the root tsconfig, the demo's
 * tsconfig, the type tests — maps `react-use-wasm` to src/, so a broken
 * .d.ts would ship unnoticed. This compiles a realistic snippet against
 * dist/index.d.ts instead.
 *
 * The probe lives under node_modules so that `react` resolves normally.
 */
const probeDir = resolve(root, "node_modules/.dist-types-probe");

const PROBE = `
import {
  useWasm,
  useWasmWorker,
  clearWasmCache,
  WASM_WORKER_SOURCE,
  type UseWasmOptions,
  type UseWasmResult,
  type UseWasmState,
  type UseWasmWorkerOptions,
  type UseWasmWorkerResult,
  type UseWasmWorkerState,
  type WasmFunctionKeys,
} from "react-use-wasm";

interface Exports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  add(a: number, b: number): number;
  big(n: bigint): bigint;
}

declare const main: UseWasmResult<Exports>;
declare const worker: UseWasmWorkerResult<Exports>;

// The values are exported, not just the types.
void useWasm;
void useWasmWorker;
void clearWasmCache;
const source: string = WASM_WORKER_SOURCE;
void source;

// Types line up.
const sum: number = main.call("add", 1, 2);
const big: bigint = main.call("big", 1n);
const later: Promise<number> = worker.call("add", 1, 2);
void sum; void big; void later;

// isReady still narrows through the published declarations.
const { isReady, exports } = main;
if (isReady) {
  const n: number = exports.add(1, 2);
  const m: WebAssembly.Memory = exports.memory;
  void n; void m;
}

// And the guard rails still bite.
// @ts-expect-error add takes two arguments
main.call("add", 1);
// @ts-expect-error memory is not a function export
main.call("memory");
// @ts-expect-error _initialize is excluded
main.call("_initialize");
// @ts-expect-error not an export
main.call("nope");

declare const o1: UseWasmOptions;
declare const o2: UseWasmWorkerOptions;
declare const s1: UseWasmState<Exports>;
declare const s2: UseWasmWorkerState;
declare const k: WasmFunctionKeys<Exports>;
void o1; void o2; void s1; void s2; void k;
`;

describe.skipIf(!existsSync(dts))("the published declarations", () => {
  it("type-check against a real consumer", async () => {
    await rm(probeDir, { recursive: true, force: true });
    await mkdir(probeDir, { recursive: true });

    await writeFile(resolve(probeDir, "probe.ts"), PROBE, "utf8");
    await writeFile(
      resolve(probeDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "DOM"],
            module: "ESNext",
            moduleResolution: "Bundler",
            strict: true,
            skipLibCheck: true,
            noEmit: true,
            baseUrl: ".",
            // The point of the test: resolve to dist, not src.
            paths: { "react-use-wasm": [dts] },
          },
          include: ["probe.ts"],
        },
        null,
        2
      ),
      "utf8"
    );

    let errors = "";
    try {
      await run("node", [
        resolve(root, "node_modules/typescript/bin/tsc"),
        "--noEmit",
        "-p",
        resolve(probeDir, "tsconfig.json"),
      ]);
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      errors = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
    } finally {
      await rm(probeDir, { recursive: true, force: true });
    }

    expect(errors, "dist/index.d.ts did not type-check").toBe("");
  }, 60_000);
});
