import type { ReactNode } from "react";
import { Boxes, Download, FileCode2, Hammer, Play } from "lucide-react";
import { Js, Wasm } from "@/components/Term";
import { CodeBlock, CodeTabs } from "@/components/CodeBlock";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Five steps from nothing to a running module, using the same fib the
 * Benchmarks tab races. Everything here is real: the Go is
 * examples/go/math/math.go and the build command is the one in
 * scripts/build-wasm.sh.
 */

function Step({
  n,
  icon,
  title,
  badge,
  description,
  last,
  children,
}: {
  n: number;
  icon: ReactNode;
  title: string;
  badge?: string;
  description: ReactNode;
  /** Suppresses the connector below the card. */
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="bg-primary text-primary-foreground tabular flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
              {n}
            </span>
            {icon}
            <span>{title}</span>
            {badge && <Badge variant="secondary">{badge}</Badge>}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">{children}</CardContent>
      </Card>

      {/*
       * Connector into the next card. left-9 lines it up with the middle
       * of the number badge (24px of card padding plus half of its 24px
       * width), and h-6 is exactly the space-y-6 gap it has to cross.
       */}
      {!last && <div aria-hidden className="bg-border absolute top-full left-9 h-6 w-px" />}
    </div>
  );
}

const INSTALL = `npm install react-use-wasm`;

const GO = `package main

// fib is the naive recursive version on purpose: at n around 40 it
// takes long enough to be worth moving off the main thread.
//
//go:wasmexport fib
func fib(n int32) int32 {
	if n < 2 {
		return n
	}
	return fib(n-1) + fib(n-2)
}

// TinyGo needs a main, even though nothing calls it.
func main() {}`;

const BUILD = `tinygo build -target=wasm-unknown -no-debug -o math.wasm .`;

const TYPES = `// Nothing checks this against the real binary, so it is worth a test.
// int32 and float64 both arrive as number; int64 arrives as bigint.
export interface MathExports {
  fib(n: number): number;
}`;

const USE_MAIN = `import { useWasm } from "react-use-wasm";

export function Fib() {
  const { isReady, call } = useWasm<MathExports>("/math.wasm");
  if (!isReady) return <p>Loading…</p>;

  // Synchronous, and typed: call("fib", "20") is a compile error.
  return <p>fib(20) = {call("fib", 20)}</p>;
}`;

const USE_WORKER = `import { useWasmWorker } from "react-use-wasm";

export function Fib() {
  const [value, setValue] = useState<number | null>(null);
  const { isReady, call } = useWasmWorker<MathExports>("/math.wasm");

  // fib(40) is about 240ms. On the main thread that is a quarter of a
  // second of frozen page; here the UI keeps painting throughout.
  const run = async () => setValue(await call("fib", 40));

  return (
    <>
      <button onClick={run} disabled={!isReady}>Compute</button>
      {value !== null && <p>fib(40) = {value}</p>}
    </>
  );
}`;

export function GettingStartedPage() {
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        From nothing to a running module in five steps, using the same <code>fib</code> the
        Benchmarks tab races. The Go below is really <code>examples/go/math/math.go</code> in this
        repo, so you can check the output against what the demo loads.
      </p>

      <Step
        n={1}
        icon={<Download className="text-primary size-4" />}
        title="Install"
        badge="zero dependencies"
        description={
          <>
            React 18 or 19 is the only peer dependency. ESM and CJS, with a{" "}
            <code>"use client"</code> banner so it drops into the Next.js app router unchanged.
          </>
        }
      >
        <CodeBlock code={INSTALL} label="Shell" language="bash" />
        <p className="text-muted-foreground text-sm">
          Or <code>pnpm add react-use-wasm</code> / <code>yarn add react-use-wasm</code>.
        </p>
      </Step>

      <Step
        n={2}
        icon={<FileCode2 className="text-primary size-4" />}
        title="Write the module"
        badge="TinyGo"
        description={
          <>
            Any toolchain that emits a plain <code>.wasm</code> works. This is TinyGo, where{" "}
            <code>//go:wasmexport</code> is what makes a function callable from <Js />.
          </>
        }
      >
        <CodeBlock code={GO} label="Go" language="go" />
        <p className="text-muted-foreground text-sm">
          Use explicit <code>int32</code> and <code>float64</code> types so the <Js /> side is
          unambiguous. An <code>int64</code> arrives as a <code>bigint</code>, not a number, and
          silently wrong arithmetic is the usual result of forgetting that.
        </p>
      </Step>

      <Step
        n={3}
        icon={<Hammer className="text-primary size-4" />}
        title="Build and serve it"
        description={
          <>
            The <code>wasm-unknown</code> target emits a module with no WASI imports and no glue
            file, which is exactly what these hooks expect.
          </>
        }
      >
        <CodeBlock code={BUILD} label="Shell" language="bash" />
        <p className="text-muted-foreground text-sm">
          Then serve the file statically: <code>public/</code> in both Vite and Next.js. Not{" "}
          <code>GOOS=js GOARCH=wasm</code> with standard Go. That exports nothing callable and needs
          the <code>wasm_exec.js</code> runtime shim. Serve the file as{" "}
          <code>application/wasm</code> if you can, and the hooks use <code>compileStreaming</code>;
          if your host sends the wrong type they fall back to <code>compile()</code> rather than
          failing.
        </p>
      </Step>

      <Step
        n={4}
        icon={<Boxes className="text-primary size-4" />}
        title="Describe the exports"
        description={
          <>
            One interface gives <code>call</code> and <code>exports</code> their types. Declare only
            what you use; anything undeclared is simply invisible.
          </>
        }
      >
        <CodeBlock code={TYPES} label="TypeScript" />
      </Step>

      <Step
        n={5}
        last
        icon={<Play className="text-primary size-4" />}
        title="Call it"
        description={
          <>
            Pick the hook by how long a call takes. Under about 50ms, <code>useWasm</code>. Longer
            than that and it is a frozen page, so <code>useWasmWorker</code>.
          </>
        }
      >
        <CodeTabs
          testId="start-code-tabs"
          variants={[
            { label: "useWasm", code: USE_MAIN },
            { label: "useWasmWorker", code: USE_WORKER },
          ]}
        />
        <p className="text-muted-foreground text-sm">
          That is the whole API for a module like this. Passing anything bigger than a number needs
          the memory layer, which the <strong className="text-foreground">Examples</strong> tab
          covers and <Wasm>wasm</Wasm> modules that only deal in numbers never touch.
        </p>
      </Step>
    </div>
  );
}
