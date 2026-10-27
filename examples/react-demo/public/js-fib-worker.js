// A plain JavaScript Web Worker, for comparison against useWasmWorker.
//
// Same naive recursive fib as examples/go/math.go, and the same
// request/response message shape, so the only difference being measured is
// JS versus wasm.
function fib(n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

self.onmessage = (event) => {
  const { id, n } = event.data;
  try {
    self.postMessage({ id, result: fib(n) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
