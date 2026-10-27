import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type AnyFn = (...args: any[]) => any;

/**
 * Keys of T whose values are functions (i.e. callable wasm exports).
 * `_initialize` is excluded: the hooks run it for you at startup and it
 * must not be called twice.
 */
export type WasmFunctionKeys<T> = Exclude<
  {
    [K in keyof T]: T[K] extends AnyFn ? K : never;
  }[keyof T] &
    string,
  "_initialize"
>;

export type Fn<T, K extends keyof T> = Extract<T[K], AnyFn>;

export type UseWasmState<T> =
  | { status: "idle"; exports: null; error: null }
  | { status: "loading"; exports: null; error: null }
  | { status: "ready"; exports: T; error: null }
  | { status: "error"; exports: null; error: Error };

export interface UseWasmOptions {
  /** Import object passed to WebAssembly.instantiate (e.g. { env: { log } }). */
  imports?: WebAssembly.Imports;
  /** Reuse the compiled module across components with the same URL. Default: true. */
  cache?: boolean;
  /** Extra fetch options (headers, credentials, …). */
  fetchInit?: RequestInit;
}

export interface UseWasmHelpers<T> {
  /** Typed call into an exported function. Throws if the module isn't ready. */
  call: <K extends WasmFunctionKeys<T>>(
    name: K,
    ...args: Parameters<Fn<T, K>>
  ) => ReturnType<Fn<T, K>>;
  isReady: boolean;
  /** Re-fetch, recompile and re-instantiate the module. */
  reload: () => void;
}

export type UseWasmResult<T> = UseWasmState<T> & UseWasmHelpers<T>;

/* ------------------------------------------------------------------ */
/* Module loading + cache                                              */
/* ------------------------------------------------------------------ */

const moduleCache = new Map<string, Promise<WebAssembly.Module>>();

async function compileFromUrl(
  url: string,
  init?: RequestInit,
  signal?: AbortSignal
): Promise<WebAssembly.Module> {
  const res = await fetch(url, { ...init, signal });
  if (!res.ok) {
    throw new Error(`useWasm: failed to fetch ${url} (${res.status} ${res.statusText})`);
  }
  // Streaming compile needs the server to send `Content-Type: application/wasm`.
  const isWasmMime = res.headers.get("content-type")?.includes("application/wasm");
  if (isWasmMime && typeof WebAssembly.compileStreaming === "function") {
    return WebAssembly.compileStreaming(res);
  }
  return WebAssembly.compile(await res.arrayBuffer());
}

/** Fetch + compile (cached per URL). Shared by useWasm and useWasmWorker. */
export function loadModule(
  url: string,
  init: RequestInit | undefined,
  useCache: boolean,
  signal: AbortSignal
): Promise<WebAssembly.Module> {
  if (!useCache) return compileFromUrl(url, init, signal);

  let pending = moduleCache.get(url);
  if (!pending) {
    // Not tied to one component's AbortSignal, since others may share it.
    pending = compileFromUrl(url, init);
    moduleCache.set(url, pending);
    pending.catch(() => moduleCache.delete(url)); // allow retry after failure
  }
  return pending;
}

/** Remove a URL (or everything) from the compiled-module cache. */
export function clearWasmCache(url?: string) {
  if (url) moduleCache.delete(url);
  else moduleCache.clear();
}

/**
 * WASI "reactor" convention. Modules built as libraries rather than commands
 * (Go's `-buildmode=c-shared`, wasi-libc reactors) export `_initialize` and
 * need it run once before any other export is touched.
 */
export function runReactorInit(exports: WebAssembly.Exports): void {
  const init = exports._initialize;
  if (typeof init === "function") (init as AnyFn)();
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

const IDLE = { status: "idle", exports: null, error: null } as const;
const LOADING = { status: "loading", exports: null, error: null } as const;

/**
 * Load a WebAssembly module and call its exports with full typing.
 *
 * @example
 * interface MathExports { add(a: number, b: number): number; memory: WebAssembly.Memory }
 * const { status, call } = useWasm<MathExports>("/math.wasm");
 * if (status === "ready") call("add", 2, 3); // typed: (a: number, b: number) => number
 *
 * Pass `null` as the url to skip loading.
 * `imports` is read when loading starts; changing it later doesn't trigger a reload
 * (so an inline object is fine). Call `reload()` if you need new imports applied.
 */
export function useWasm<T extends object = WebAssembly.Exports>(
  url: string | null,
  options: UseWasmOptions = {}
): UseWasmResult<T> {
  const { cache = true } = options;

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const [state, setState] = useState<UseWasmState<T>>(url ? LOADING : IDLE);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!url) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState(LOADING);

    (async () => {
      try {
        const { imports = {}, fetchInit } = optionsRef.current;
        const module = await loadModule(url, fetchInit, cache, controller.signal);
        const instance = await WebAssembly.instantiate(module, imports);
        // Run before reporting ready, so the first call never hits an
        // uninitialised module.
        runReactorInit(instance.exports);
        if (!cancelled) {
          setState({
            status: "ready",
            exports: instance.exports as unknown as T,
            error: null,
          });
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          exports: null,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, cache, reloadKey]);

  const exports = state.exports;

  const call = useCallback(
    <K extends WasmFunctionKeys<T>>(
      name: K,
      ...args: Parameters<Fn<T, K>>
    ): ReturnType<Fn<T, K>> => {
      if (!exports) {
        throw new Error(`useWasm: "${name}" called before the module was ready`);
      }
      const fn = exports[name as unknown as keyof T];
      if (typeof fn !== "function") {
        throw new Error(`useWasm: export "${name}" is not a function`);
      }
      return (fn as AnyFn)(...args);
    },
    [exports]
  );

  const reload = useCallback(() => {
    if (url) moduleCache.delete(url);
    setReloadKey((k) => k + 1);
  }, [url]);

  return { ...state, call, isReady: state.status === "ready", reload } as UseWasmResult<T>;
}
