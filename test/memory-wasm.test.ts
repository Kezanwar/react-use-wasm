import { describe, expect, it } from "vitest";
import {
  MEMORY_FUNCTION_NAMES,
  type MemoryExports,
} from "../examples/react-demo/src/memory-exports";
import { memoryWasmBytes } from "./helpers/wat";

/**
 * Checks the committed memory.wasm against the MemoryExports interface.
 *
 * Separate binary from math.wasm, and separate on purpose: V8 stops
 * top-tiering a wasm module once it grows past a few kB, and bundling this
 * one in cost the fib benchmark about a third of its speed. See USAGE.md.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function instantiate() {
  const { instance, module } = await WebAssembly.instantiate(await memoryWasmBytes(), {});
  return { exports: instance.exports as unknown as MemoryExports, module };
}

async function ready() {
  const handle = await instantiate();
  handle.exports._initialize();
  return handle;
}

/** Go packs an (offset, length) pair into one i64. */
const unpack = (packed: bigint) => ({
  ptr: Number(packed >> 32n),
  len: Number(packed & 0xffffffffn),
});

describe("examples/go/memory -> memory.wasm", () => {
  it("imports nothing at all", async () => {
    const { module } = await instantiate();
    expect(WebAssembly.Module.imports(module)).toEqual([]);
  });

  it("exports an _initialize, which is why the hooks call it", async () => {
    const { exports } = await instantiate();
    expect(typeof exports._initialize).toBe("function");
  });

  it("exports every function named in MemoryExports", async () => {
    const { exports } = await instantiate();
    for (const name of MEMORY_FUNCTION_NAMES) {
      expect(typeof exports[name], `export "${name}"`).toBe("function");
    }
  });

  it("exports memory", async () => {
    const { exports } = await instantiate();
    expect(exports.memory).toBeInstanceOf(WebAssembly.Memory);
  });

  it("does not export the arithmetic functions, which live in math.wasm", async () => {
    const { exports } = await instantiate();
    expect((exports as unknown as Record<string, unknown>).fib).toBeUndefined();
    expect((exports as unknown as Record<string, unknown>).add).toBeUndefined();
  });
});

describe("the linear-memory protocol", () => {
  it("alloc returns a usable offset and free does not throw", async () => {
    const { exports } = await ready();
    const ptr = exports.alloc(64);
    expect(ptr).toBeGreaterThan(0);
    expect(ptr + 64).toBeLessThanOrEqual(exports.memory.buffer.byteLength);
    expect(() => exports.free(ptr)).not.toThrow();
  });

  it("alloc of nothing returns a null offset", async () => {
    const { exports } = await ready();
    expect(exports.alloc(0)).toBe(0);
  });

  it("sums an Int32Array passed by offset", async () => {
    const { exports } = await ready();
    const xs = Int32Array.from([5, 3, 9, 1, 7]);
    const ptr = exports.alloc(xs.byteLength);
    new Int32Array(exports.memory.buffer, ptr, xs.length).set(xs);

    expect(exports.sumInt32(ptr, xs.length)).toBe(25);
    exports.free(ptr);
  });

  it("sorts an Int32Array in place, which JS reads back", async () => {
    const { exports } = await ready();
    const xs = Int32Array.from([5, 3, 9, 1, 7]);
    const ptr = exports.alloc(xs.byteLength);
    new Int32Array(exports.memory.buffer, ptr, xs.length).set(xs);

    exports.sortInt32(ptr, xs.length);

    expect([...new Int32Array(exports.memory.buffer, ptr, xs.length)]).toEqual([1, 3, 5, 7, 9]);
    exports.free(ptr);
  });

  it("scales a Float64Array in place", async () => {
    const { exports } = await ready();
    const xs = Float64Array.from([1.5, 2, 4]);
    const ptr = exports.alloc(xs.byteLength);
    new Float64Array(exports.memory.buffer, ptr, xs.length).set(xs);

    exports.scaleFloat64(ptr, xs.length, 2.5);

    expect([...new Float64Array(exports.memory.buffer, ptr, xs.length)]).toEqual([3.75, 5, 10]);
    exports.free(ptr);
  });

  it("uppercases a string in place", async () => {
    const { exports } = await ready();
    const bytes = encoder.encode("hello wasm");
    const ptr = exports.alloc(bytes.length);
    new Uint8Array(exports.memory.buffer).set(bytes, ptr);

    exports.upperInPlace(ptr, bytes.length);

    expect(decoder.decode(new Uint8Array(exports.memory.buffer, ptr, bytes.length))).toBe(
      "HELLO WASM"
    );
    exports.free(ptr);
  });

  it("returns a new string as a packed (offset, length) bigint", async () => {
    const { exports } = await ready();
    const bytes = encoder.encode("hello wasm");
    const ptr = exports.alloc(bytes.length);
    new Uint8Array(exports.memory.buffer).set(bytes, ptr);

    const packed = exports.reverseString(ptr, bytes.length);
    expect(typeof packed).toBe("bigint");

    const out = unpack(packed);
    expect(out.len).toBe(bytes.length);
    expect(decoder.decode(new Uint8Array(exports.memory.buffer, out.ptr, out.len))).toBe(
      "msaw olleh"
    );

    exports.free(out.ptr);
    exports.free(ptr);
  });

  it("averages a struct array through an out-pointer", async () => {
    const { exports } = await ready();
    // Four corners of a square: Point is two float64s, 16 bytes, no padding.
    const points = Float64Array.from([0, 0, 10, 0, 10, 10, 0, 10]);
    const ptr = exports.alloc(points.byteLength);
    new Float64Array(exports.memory.buffer, ptr, points.length).set(points);
    const out = exports.alloc(16);

    exports.centroid(ptr, 4, out);

    expect([...new Float64Array(exports.memory.buffer, out, 2)]).toEqual([5, 5]);
    exports.free(out);
    exports.free(ptr);
  });

  it("round-trips objects as JSON", async () => {
    const { exports } = await ready();
    const json = encoder.encode(
      JSON.stringify([
        { name: "Ada", age: 36 },
        { name: "Alan", age: 41 },
        { name: "Grace", age: 45 },
      ])
    );
    const ptr = exports.alloc(json.length);
    new Uint8Array(exports.memory.buffer).set(json, ptr);

    const out = unpack(exports.jsonStats(ptr, json.length));
    const stats = JSON.parse(
      decoder.decode(new Uint8Array(exports.memory.buffer, out.ptr, out.len))
    );

    expect(stats.count).toBe(3);
    expect(stats.meanAge).toBeCloseTo(40.667, 3);
    expect(stats.oldest).toBe("Grace");

    exports.free(out.ptr);
    exports.free(ptr);
  });

  it("reports unparseable JSON as a zero packed value", async () => {
    const { exports } = await ready();
    const bytes = encoder.encode("not json");
    const ptr = exports.alloc(bytes.length);
    new Uint8Array(exports.memory.buffer).set(bytes, ptr);

    expect(exports.jsonStats(ptr, bytes.length)).toBe(0n);
    exports.free(ptr);
  });
});
