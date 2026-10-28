import type { ReactNode } from "react";
import { siC, siGo, siReact, siRust, siWebassembly } from "simple-icons";
import { cn } from "cn";

/**
 * The names that carry colour throughout the demo. Using these rather than
 * typing the words keeps the mapping consistent: violet is always
 * WebAssembly, gold is always JavaScript, and each language keeps its own
 * brand colour.
 *
 * Pass `icon` to show the brand mark too. Only the tagline does; repeating
 * logos through body prose would be noise.
 */

/**
 * A brand mark from simple-icons, whose path data is CC0. Sized in `em` so
 * it tracks the text it sits in, and nudged down to sit on the baseline.
 */
function Mark({ icon, className }: { icon: { path: string }; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("mr-1 inline-block size-[0.95em] shrink-0 align-[-0.1em]", className)}
    >
      <path d={icon.path} fill="currentColor" />
    </svg>
  );
}

export function Wasm({ children = "WebAssembly", icon }: { children?: string; icon?: boolean }) {
  return (
    <span className="text-wasm font-semibold whitespace-nowrap">
      {icon && <Mark icon={siWebassembly} />}
      {children}
    </span>
  );
}

export function Js({ children = "JS" }: { children?: string }) {
  return <span className="text-js font-semibold">{children}</span>;
}

export function Go({ children = "Go", icon }: { children?: string; icon?: boolean }) {
  return (
    <span className="text-go font-semibold whitespace-nowrap">
      {icon && <Mark icon={siGo} />}
      {children}
    </span>
  );
}

export function Rust({ children = "Rust", icon }: { children?: string; icon?: boolean }) {
  return (
    <span className="text-rust font-semibold whitespace-nowrap">
      {icon && <Mark icon={siRust} />}
      {children}
    </span>
  );
}

/**
 * Named CLang because `C` on its own is a poor component name.
 *
 * With `icon` the word is dropped: C's mark is the letter C, so showing
 * both reads as a stutter. The label stays for screen readers.
 */
export function CLang({ children = "C", icon }: { children?: string; icon?: boolean }) {
  return (
    <span className="text-clang font-semibold whitespace-nowrap">
      {icon ? (
        <>
          <Mark icon={siC} className="mr-0" />
          <span className="sr-only">{children}</span>
        </>
      ) : (
        children
      )}
    </span>
  );
}

/**
 * React keeps the plain foreground colour in prose, but the mark is the
 * brand, so it takes React's own cyan.
 */
export function React_({ children = "React", icon }: { children?: string; icon?: boolean }) {
  return (
    <span className="text-foreground whitespace-nowrap">
      {icon && <Mark icon={siReact} className="text-[#61dafb]" />}
      {children}
    </span>
  );
}

/**
 * A product or spec name: Next.js, Vite, ESM, WASI. No colour of its own,
 * but lifted out of the muted body text so it reads as a proper noun
 * rather than prose.
 */
export function Name({ children }: { children: ReactNode }) {
  return <span className="text-foreground">{children}</span>;
}
