import { useCallback, useEffect, useRef, useState } from "react";
import { loadModule, type Fn, type WasmFunctionKeys } from "./use-wasm";

/* ------------------------------------------------------------------ */
/* Worker script                                                       */
/* ------------------------------------------------------------------ */

/**
 * Source of the worker. It's inlined as a Blob URL so no bundler config is needed.
 * Under a strict CSP that blocks `blob:` workers, save this string as a .js file,
 * serve it yourself and pass its URL as `workerUrl`.
 */
export const WASM_WORKER_SOURCE = `
let wasmExports = null;

const serialize = (err) => ({
  name: (err && err.name) || "Error",
  message: (err && err.message) || String(err),
  stack: err && err.stack,
});

self.onmessage = async (event) => {
  const msg = event.data;

  if (msg.type === "init") {
    try {
      let imports = {};
      if (msg.importsUrl) {
        const mod = await import(msg.importsUrl);
        const provided = mod.default ?? mod.imports ?? {};
        imports = typeof provided === "function" ? await provided() : provided;
      }
      const instance = await WebAssembly.instantiate(msg.module, imports);
      wasmExports = instance.exports;
      // WASI "reactor" convention: run _initialize once before reporting ready.
      if (typeof wasmExports._initialize === "function") {
        wasmExports._initialize();
      }
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "init-error", error: serialize(err) });
    }
    return;
  }

  if (msg.type === "call") {
    try {
      const fn = wasmExports && wasmExports[msg.name];
      if (typeof fn !== "function") {
        throw new Error('export "' + msg.name + '" is not a function');
      }
      const result = await fn(...msg.args);
      self.postMessage({ type: "result", id: msg.id, result });
    } catch (err) {
      self.postMessage({ type: "error", id: msg.id, error: serialize(err) });
    }
  }
};
`;

let blobWorkerUrl: string | null = null;
function defaultWorkerUrl(): string {
  blobWorkerUrl ??= URL.createObjectURL(
    new Blob([WASM_WORKER_SOURCE], { type: "text/javascript" })
  );
  return blobWorkerUrl;
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type UseWasmWorkerState =
  | { status: "idle"; error: null }
  | { status: "loading"; error: null }
  | { status: "ready"; error: null }
  | { status: "error"; error: Error };

export interface UseWasmWorkerOptions {
  /**
   * URL of a plain JS ES module that provides the wasm import object.
   * (Functions can't be sent to a worker, so the worker imports them itself.)
   * Its default export can be an object or a (possibly async) function returning one:
   *   export default { env: { log: (x) => console.log(x) } };
   */
  importsUrl?: string;
  /** Reuse the compiled module across components with the same URL. Default: true. */
  cache?: boolean;
  /** Extra fetch options (headers, credentials, …). */
  fetchInit?: RequestInit;
  /** Custom worker script URL (see WASM_WORKER_SOURCE). Defaults to an inline blob worker. */
  workerUrl?: string;
}

export interface UseWasmWorkerHelpers<T> {
  /**
   * Typed async call into an exported function, run inside the worker.
   * Arguments and results must be structured-cloneable (numbers and bigints are fine).
   * Rejects if the module isn't ready or the worker is terminated mid-call.
   */
  call: <K extends WasmFunctionKeys<T>>(
    name: K,
    ...args: Parameters<Fn<T, K>>
  ) => Promise<Awaited<ReturnType<Fn<T, K>>>>;
  isReady: boolean;
  /** Start a fresh worker (re-fetches the module). Also restarts after terminate(). */
  reload: () => void;
  /** Kill the worker immediately, e.g. to cancel a runaway call. Pending calls reject. */
  terminate: () => void;
}

export type UseWasmWorkerResult<T> = UseWasmWorkerState & UseWasmWorkerHelpers<T>;

type Pending = { resolve: (value: any) => void; reject: (reason: Error) => void };
type SerializedError = { name: string; message: string; stack?: string };

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

const IDLE = { status: "idle", error: null } as const;
const LOADING = { status: "loading", error: null } as const;
const READY = { status: "ready", error: null } as const;

function toError(e: SerializedError): Error {
  const err = new Error(e.message);
  err.name = e.name;
  if (e.stack) err.stack = e.stack;
  return err;
}

/**
 * Like useWasm, but the module lives in a Web Worker so long-running calls
 * never block the main thread. `call` returns a Promise.
 *
 * @example
 * const { isReady, call } = useWasmWorker<MathExports>("/math.wasm");
 * const result = await call("fib", 40); // Promise<number>, UI stays responsive
 */
export function useWasmWorker<T extends object = WebAssembly.Exports>(
  url: string | null,
  options: UseWasmWorkerOptions = {}
): UseWasmWorkerResult<T> {
  const { cache = true } = options;

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const [state, setState] = useState<UseWasmWorkerState>(url ? LOADING : IDLE);
  const [reloadKey, setReloadKey] = useState(0);

  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef(new Map<number, Pending>());
  const nextIdRef = useRef(0);

  const rejectAll = useCallback((reason: Error) => {
    for (const p of pendingRef.current.values()) p.reject(reason);
    pendingRef.current.clear();
  }, []);

  useEffect(() => {
    if (!url) {
      setState(IDLE);
      return;
    }

    const { workerUrl, importsUrl, fetchInit } = optionsRef.current;
    const worker = new Worker(workerUrl ?? defaultWorkerUrl(), { type: "module" });
    workerRef.current = worker;
    readyRef.current = false;
    setState(LOADING);

    const controller = new AbortController();
    const isCurrent = () => workerRef.current === worker;

    const fail = (error: Error) => {
      if (!isCurrent()) return;
      readyRef.current = false;
      setState({ status: "error", error });
    };

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      switch (msg.type) {
        case "ready":
          if (isCurrent()) {
            readyRef.current = true;
            setState(READY);
          }
          break;
        case "init-error":
          fail(toError(msg.error));
          break;
        case "result":
        case "error": {
          const pending = pendingRef.current.get(msg.id);
          if (!pending) break;
          pendingRef.current.delete(msg.id);
          if (msg.type === "result") pending.resolve(msg.result);
          else pending.reject(toError(msg.error));
          break;
        }
      }
    };

    // Fires if the worker script itself fails (bad URL, CSP, syntax error).
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      const error = new Error(`useWasmWorker: worker failed: ${event.message || "unknown error"}`);
      rejectAll(error);
      fail(error);
    };

    (async () => {
      try {
        // Compile on the main thread (async, off-thread in the browser) so the
        // compile cache is shared with useWasm, then hand the Module to the worker.
        const module = await loadModule(url, fetchInit, cache, controller.signal);
        if (!isCurrent()) return;
        worker.postMessage({
          type: "init",
          module,
          // Resolve now: inside a blob worker, relative URLs would have no sensible base.
          importsUrl: importsUrl ? new URL(importsUrl, location.href).href : undefined,
        });
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      controller.abort();
      worker.terminate();
      if (isCurrent()) {
        workerRef.current = null;
        readyRef.current = false;
      }
      rejectAll(new Error("useWasmWorker: worker terminated"));
    };
  }, [url, cache, reloadKey, rejectAll]);

  // Stable identity: safe to use in effect dependency arrays.
  const call = useCallback(
    <K extends WasmFunctionKeys<T>>(
      name: K,
      ...args: Parameters<Fn<T, K>>
    ): Promise<Awaited<ReturnType<Fn<T, K>>>> => {
      const worker = workerRef.current;
      if (!worker || !readyRef.current) {
        return Promise.reject(
          new Error(`useWasmWorker: "${name}" called before the module was ready`)
        );
      }
      const id = nextIdRef.current++;
      return new Promise((resolve, reject) => {
        pendingRef.current.set(id, { resolve, reject });
        try {
          worker.postMessage({ type: "call", id, name, args });
        } catch (err) {
          // e.g. DataCloneError for a non-cloneable argument
          pendingRef.current.delete(id);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
    []
  );

  const terminate = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    worker.terminate();
    workerRef.current = null;
    readyRef.current = false;
    rejectAll(new Error("useWasmWorker: worker terminated"));
    setState(IDLE);
  }, [rejectAll]);

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  return {
    ...state,
    call,
    isReady: state.status === "ready",
    reload,
    terminate,
  } as UseWasmWorkerResult<T>;
}
