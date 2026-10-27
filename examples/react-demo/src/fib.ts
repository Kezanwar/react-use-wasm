/**
 * The same naive recursive fib as examples/go/math.go, in JavaScript, so the
 * two can be compared like for like. Deliberately not memoised or iterative:
 * the point is a lump of pure compute, not a good fibonacci.
 */
export function jsFib(n: number): number {
  return n < 2 ? n : jsFib(n - 1) + jsFib(n - 2);
}
