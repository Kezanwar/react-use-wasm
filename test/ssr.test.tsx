import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
// A bare top-level import in the node environment is itself the first check:
// if anything in the package touched window/document at module scope, this
// file would fail to load.
import { clearWasmCache, useWasm, useWasmWorker, WASM_WORKER_SOURCE } from "react-use-wasm";

const run = promisify(execFile);
const root = process.cwd();
const DIST_ESM = resolve(root, "dist/index.js");
const DIST_CJS = resolve(root, "dist/index.cjs");

describe("SSR safety", () => {
  it("runs in an environment with no DOM", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("imports cleanly and exposes the public API", () => {
    expect(typeof useWasm).toBe("function");
    expect(typeof useWasmWorker).toBe("function");
    expect(typeof clearWasmCache).toBe("function");
    expect(typeof WASM_WORKER_SOURCE).toBe("string");
  });

  it("does not call URL.createObjectURL at import time", async () => {
    // The blob worker URL must only be minted when a worker is actually
    // started, never while the module is being evaluated.
    const spy = vi.spyOn(URL, "createObjectURL");
    vi.resetModules();
    await import("react-use-wasm");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("renders both hooks to a string without touching browser globals", () => {
    function Page() {
      const main = useWasm<{ add(a: number, b: number): number }>("/math.wasm");
      const worker = useWasmWorker<{ add(a: number, b: number): number }>("/math.wasm");
      return (
        <div>
          <span>{`main:${main.status}`}</span>
          <span>{`worker:${worker.status}`}</span>
        </div>
      );
    }

    const html = renderToString(<Page />);
    // Effects never run on the server, so both sit at their initial state.
    expect(html).toContain("main:loading");
    expect(html).toContain("worker:loading");
  });

  it("renders a null url as idle", () => {
    function Page() {
      return <span>{useWasm(null).status}</span>;
    }
    expect(renderToString(<Page />)).toContain("idle");
  });
});

/**
 * The strongest version of the check: a separate Node process where the
 * browser globals are booby-trapped, importing the *built* package.
 */
describe("built output imports under hostile globals", () => {
  const hostilePrelude = `
    for (const name of ["window", "document", "Worker", "location"]) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() { throw new Error("SSR violation: read " + name + " at import time"); },
      });
    }
    globalThis.fetch = () => { throw new Error("SSR violation: called fetch at import time"); };
    URL.createObjectURL = () => { throw new Error("SSR violation: called URL.createObjectURL at import time"); };
    const EXPECTED = ["useWasm", "useWasmWorker", "clearWasmCache", "WASM_WORKER_SOURCE"];
  `;

  it.skipIf(!existsSync(DIST_ESM))("loads dist/index.js (ESM)", async () => {
    const { stdout } = await run("node", [
      "--input-type=module",
      "-e",
      `${hostilePrelude}
       const mod = await import(${JSON.stringify(pathToFileURL(DIST_ESM).href)});
       const missing = EXPECTED.filter((k) => !(k in mod));
       if (missing.length) throw new Error("missing exports: " + missing.join(", "));
       console.log("SSR_ESM_OK");`,
    ]);
    expect(stdout).toContain("SSR_ESM_OK");
  });

  it.skipIf(!existsSync(DIST_CJS))("loads dist/index.cjs (CJS)", async () => {
    const { stdout } = await run("node", [
      "--input-type=commonjs",
      "-e",
      `${hostilePrelude}
       const mod = require(${JSON.stringify(DIST_CJS)});
       const missing = EXPECTED.filter((k) => !(k in mod));
       if (missing.length) throw new Error("missing exports: " + missing.join(", "));
       console.log("SSR_CJS_OK");`,
    ]);
    expect(stdout).toContain("SSR_CJS_OK");
  });
});
