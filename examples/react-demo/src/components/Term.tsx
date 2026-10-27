/**
 * The two names that carry colour throughout the demo. Using these rather
 * than typing the words keeps the mapping consistent: violet is always
 * WebAssembly, gold is always JavaScript.
 */
export function Wasm({ children = "WebAssembly" }: { children?: string }) {
  return <span className="text-wasm font-semibold">{children}</span>;
}

export function Js({ children = "JS" }: { children?: string }) {
  return <span className="text-js font-semibold">{children}</span>;
}
