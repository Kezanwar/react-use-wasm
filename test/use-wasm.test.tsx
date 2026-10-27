// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearWasmCache, useWasm } from "react-use-wasm";
import { watToWasm } from "./helpers/wat";

interface MathExports {
  memory: WebAssembly.Memory;
  add(a: number, b: number): number;
  fib(n: number): number;
  boom(): number;
}

interface ReactorExports {
  _initialize(): void;
  initCount(): number;
}

let mathBytes: Uint8Array<ArrayBuffer>;
let reactorBytes: Uint8Array<ArrayBuffer>;

beforeEach(async () => {
  mathBytes ??= await watToWasm("math");
  reactorBytes ??= await watToWasm("reactor");
  clearWasmCache();
  vi.restoreAllMocks();
});

afterEach(() => {
  clearWasmCache();
});

/** A fetch that serves fixed bytes for every URL. */
function serve(
  byUrl: Record<string, Uint8Array<ArrayBuffer> | number>,
  contentType = "application/wasm"
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const entry = byUrl[url];
    if (entry === undefined) {
      return new Response(null, { status: 404, statusText: "Not Found" });
    }
    if (typeof entry === "number") {
      return new Response(null, { status: entry, statusText: "Not Found" });
    }
    // Response needs a fresh ArrayBuffer per call; a reused view gets detached.
    return new Response(new Uint8Array(entry), {
      status: 200,
      headers: { "content-type": contentType },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useWasm", () => {
  it("keeps isReady in step with status, and exposes exports directly", async () => {
    serve({ "/math.wasm": mathBytes });

    const { result } = renderHook(() => useWasm<MathExports>("/math.wasm"));

    // isReady is stored in the state union rather than derived at return
    // time, so this invariant is what stops the two drifting.
    expect(result.current.isReady).toBe(result.current.status === "ready");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.isReady).toBe(true);

    // call() is optional on the main thread; the instance is right there.
    expect(result.current.exports!.add(2, 3)).toBe(5);
    expect(result.current.exports!.memory).toBeInstanceOf(WebAssembly.Memory);
  });

  it("goes loading -> ready and calls exports", async () => {
    serve({ "/math.wasm": mathBytes });

    const { result } = renderHook(() => useWasm<MathExports>("/math.wasm"));

    expect(result.current.status).toBe("loading");
    expect(result.current.isReady).toBe(false);

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.isReady).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.call("add", 2, 3)).toBe(5);
    expect(result.current.call("fib", 10)).toBe(55);
  });

  it("uses the buffer path when the server does not send application/wasm", async () => {
    serve({ "/math.wasm": mathBytes }, "application/octet-stream");

    const { result } = renderHook(() => useWasm<MathExports>("/math.wasm"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.call("add", 1, 1)).toBe(2);
  });

  it("reports a 404 as an error", async () => {
    serve({ "/missing.wasm": 404 });

    const { result } = renderHook(() => useWasm<MathExports>("/missing.wasm"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toContain("failed to fetch /missing.wasm");
    expect(result.current.error?.message).toContain("404");
    expect(result.current.exports).toBeNull();
  });

  it("reports unparseable bytes as an error", async () => {
    serve({ "/bad.wasm": new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) });

    const { result } = renderHook(() => useWasm<MathExports>("/bad.wasm"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("throws a helpful error when call() runs before ready", async () => {
    serve({ "/math.wasm": mathBytes });
    const { result } = renderHook(() => useWasm<MathExports>("/math.wasm"));

    expect(() => result.current.call("add", 1, 2)).toThrow(
      /"add" called before the module was ready/
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("propagates a trap from the wasm module", async () => {
    serve({ "/math.wasm": mathBytes });
    const { result } = renderHook(() => useWasm<MathExports>("/math.wasm"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(() => result.current.call("boom")).toThrow(/unreachable/);
  });

  it("stays idle for a null url", async () => {
    const fetchMock = serve({});

    const { result } = renderHook(() => useWasm<MathExports>(null));

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.isReady).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads once the url goes from null to a real url", async () => {
    serve({ "/math.wasm": mathBytes });

    const { result, rerender } = renderHook(({ url }) => useWasm<MathExports>(url), {
      initialProps: { url: null as string | null },
    });

    await waitFor(() => expect(result.current.status).toBe("idle"));
    rerender({ url: "/math.wasm" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.call("add", 4, 4)).toBe(8);
  });

  it("reload() re-fetches and recompiles", async () => {
    const fetchMock = serve({ "/math.wasm": mathBytes });

    const { result } = renderHook(() => useWasm<MathExports>("/math.wasm"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    result.current.reload();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.call("add", 2, 2)).toBe(4);
  });

  it("shares the compile cache across hooks with the same url", async () => {
    const fetchMock = serve({ "/math.wasm": mathBytes });

    const a = renderHook(() => useWasm<MathExports>("/math.wasm"));
    const b = renderHook(() => useWasm<MathExports>("/math.wasm"));

    await waitFor(() => expect(a.result.current.status).toBe("ready"));
    await waitFor(() => expect(b.result.current.status).toBe("ready"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Separate instances, one compiled module.
    expect(a.result.current.exports).not.toBe(b.result.current.exports);
  });

  it("re-fetches when cache is false", async () => {
    const fetchMock = serve({ "/math.wasm": mathBytes });

    const a = renderHook(() => useWasm<MathExports>("/math.wasm", { cache: false }));
    const b = renderHook(() => useWasm<MathExports>("/math.wasm", { cache: false }));

    await waitFor(() => expect(a.result.current.status).toBe("ready"));
    await waitFor(() => expect(b.result.current.status).toBe("ready"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("runs _initialize exactly once, before reporting ready", async () => {
    serve({ "/reactor.wasm": reactorBytes });

    const { result } = renderHook(() => useWasm<ReactorExports>("/reactor.wasm"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.call("initCount")).toBe(1);
  });

  it("does not let a stale load win when the url changes mid-flight", async () => {
    // Hand-controlled fetch: nothing resolves until the test says so.
    const gates = new Map<string, (r: Response) => void>();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (input: RequestInfo | URL) =>
          new Promise<Response>((resolve) => gates.set(String(input), resolve))
      )
    );

    const { result, rerender } = renderHook(({ url }) => useWasm<object>(url), {
      initialProps: { url: "/slow.wasm" },
    });

    await waitFor(() => expect(gates.has("/slow.wasm")).toBe(true));

    // Switch before the first load finishes.
    rerender({ url: "/fast.wasm" });
    await waitFor(() => expect(gates.has("/fast.wasm")).toBe(true));

    const wasmResponse = (bytes: Uint8Array<ArrayBuffer>) =>
      new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { "content-type": "application/wasm" },
      });

    // Resolve the new url first, then the abandoned one.
    gates.get("/fast.wasm")!(wasmResponse(mathBytes));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(Object.keys(result.current.exports!)).toContain("add");

    gates.get("/slow.wasm")!(wasmResponse(reactorBytes));
    await new Promise((r) => setTimeout(r, 20));

    // Still the fast module. The stale one must not overwrite it.
    expect(result.current.status).toBe("ready");
    expect(Object.keys(result.current.exports!)).toContain("add");
    expect(Object.keys(result.current.exports!)).not.toContain("initCount");
  });

  it("passes imports through to the instance", async () => {
    const importsBytes = await watToWasm("imports");
    serve({ "/imports.wasm": importsBytes });
    const seen: number[] = [];

    const { result } = renderHook(() =>
      useWasm<{ logSum(a: number, b: number): number }>("/imports.wasm", {
        imports: { env: { log: (x: number) => seen.push(x) } },
      })
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.call("logSum", 40, 2)).toBe(42);
    expect(seen).toEqual([42]);
  });

  it("errors when a required import is missing", async () => {
    const importsBytes = await watToWasm("imports");
    serve({ "/imports.wasm": importsBytes });

    const { result } = renderHook(() => useWasm("/imports.wasm"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
