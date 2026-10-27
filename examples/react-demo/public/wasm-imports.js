// Import object for the worker hook.
//
// Functions can't be structured-cloned into a Worker, so `useWasmWorker`
// takes a URL instead and the worker imports this module itself. It must be
// plain JS served as-is (here, from Vite's public/ directory), not a file
// the bundler rewrites.
//
// The default export may be an object, or a (possibly async) function
// returning one.
export default {
  env: {
    log: (x) => {
      console.log("[worker] wasm logged:", x);
    },
  },
};
