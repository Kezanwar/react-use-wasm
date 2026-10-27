import type { MathExports } from "@/math-exports";

/**
 * The JavaScript half of the linear-memory protocol.
 *
 * A wasm function only takes and returns numbers, so anything larger travels
 * as an offset into `exports.memory.buffer` — one flat ArrayBuffer that both
 * sides can read and write.
 *
 * The rule that catches everyone: **never cache a typed-array view**.
 * Growing the memory detaches the old ArrayBuffer and every view onto it
 * becomes zero-length. Every helper here takes a fresh view off
 * `exports.memory.buffer` at the moment it is used.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Go packs an (offset, length) pair into one i64, which arrives as a bigint. */
export function unpack(packed: bigint): { ptr: number; len: number } {
  return { ptr: Number(packed >> 32n), len: Number(packed & 0xffffffffn) };
}

/**
 * Reserve space, run `body` with the offset, then always free.
 * Read anything you need out of memory *inside* `body`.
 */
export function withAlloc<R>(
  e: MathExports,
  bytes: number,
  body: (ptr: number) => R
): R {
  const ptr = e.alloc(bytes);
  try {
    return body(ptr);
  } finally {
    e.free(ptr);
  }
}

export function writeBytes(e: MathExports, ptr: number, data: Uint8Array): void {
  new Uint8Array(e.memory.buffer).set(data, ptr);
}

export function readBytes(e: MathExports, ptr: number, len: number): Uint8Array {
  // Copied out, so the caller is not holding a view that a later grow kills.
  return new Uint8Array(e.memory.buffer.slice(ptr, ptr + len));
}

export function readString(e: MathExports, ptr: number, len: number): string {
  return decoder.decode(readBytes(e, ptr, len));
}

export function encode(text: string): Uint8Array {
  return encoder.encode(text);
}

export function writeInt32Array(e: MathExports, ptr: number, xs: Int32Array): void {
  new Int32Array(e.memory.buffer, ptr, xs.length).set(xs);
}

export function readInt32Array(e: MathExports, ptr: number, len: number): Int32Array {
  return new Int32Array(e.memory.buffer.slice(ptr, ptr + len * 4));
}

export function writeFloat64Array(e: MathExports, ptr: number, xs: Float64Array): void {
  new Float64Array(e.memory.buffer, ptr, xs.length).set(xs);
}

export function readFloat64Array(e: MathExports, ptr: number, len: number): Float64Array {
  return new Float64Array(e.memory.buffer.slice(ptr, ptr + len * 8));
}

/**
 * Call a function that returns a packed (offset, length) bigint, read the
 * string it points at, and free it. `0n` means the module reported failure.
 */
export function takePackedString(e: MathExports, packed: bigint): string | null {
  if (packed === 0n) return null;
  const { ptr, len } = unpack(packed);
  try {
    return readString(e, ptr, len);
  } finally {
    e.free(ptr);
  }
}

/** How much linear memory the module currently owns, in bytes. */
export function memorySize(e: MathExports): number {
  return e.memory.buffer.byteLength;
}
