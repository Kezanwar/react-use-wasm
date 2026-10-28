import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A minimal stand-in for useWasmWorker that runs plain JavaScript, so the
 * worker panel can compare the two with the same round-trip overhead.
 *
 * This is demo code, not part of the package. It is deliberately shaped like
 * useWasmWorker's result so the two sides of the comparison read the same.
 */
export function useJsWorker(url: string) {
  const [isReady, setIsReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(
    new Map<number, { resolve: (v: number) => void; reject: (e: Error) => void }>()
  );
  const nextIdRef = useRef(0);

  const rejectAll = useCallback((reason: Error) => {
    for (const p of pendingRef.current.values()) p.reject(reason);
    pendingRef.current.clear();
  }, []);

  useEffect(() => {
    const worker = new Worker(url, { type: "module" });
    workerRef.current = worker;
    setIsReady(true);

    worker.onmessage = (event: MessageEvent) => {
      const { id, result, error } = event.data;
      const pending = pendingRef.current.get(id);
      if (!pending) return;
      pendingRef.current.delete(id);
      if (error) pending.reject(new Error(error));
      else pending.resolve(result);
    };

    return () => {
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
        setIsReady(false);
      }
      rejectAll(new Error("js worker terminated"));
    };
  }, [url, reloadKey, rejectAll]);

  const call = useCallback((n: number): Promise<number> => {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("js worker is not running"));
    const id = nextIdRef.current++;
    return new Promise<number>((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      worker.postMessage({ id, n });
    });
  }, []);

  const terminate = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;
    worker.terminate();
    workerRef.current = null;
    setIsReady(false);
    rejectAll(new Error("js worker terminated"));
  }, [rejectAll]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { isReady, call, terminate, reload };
}
