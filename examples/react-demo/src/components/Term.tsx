import type { ReactNode } from "react";

/**
 * The names that carry colour throughout the demo. Using these rather than
 * typing the words keeps the mapping consistent: violet is always
 * WebAssembly, gold is always JavaScript, blue is always Go.
 */
export function Wasm({ children = "WebAssembly" }: { children?: string }) {
  return <span className="text-wasm font-semibold">{children}</span>;
}

export function Js({ children = "JS" }: { children?: string }) {
  return <span className="text-js font-semibold">{children}</span>;
}

export function Go({ children = "Go" }: { children?: string }) {
  return <span className="text-go font-semibold">{children}</span>;
}

/**
 * A product or spec name: React, Vite, ESM, WASI. No colour of its own,
 * but lifted out of the muted body text so it reads as a proper noun
 * rather than prose.
 */
export function Name({ children }: { children: ReactNode }) {
  return <span className="text-foreground">{children}</span>;
}
