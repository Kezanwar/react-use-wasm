import { Heartbeat } from "@/components/Heartbeat";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MainThreadPanel } from "@/panels/MainThreadPanel";
import { WorkerPanel } from "@/panels/WorkerPanel";
import { ImportsPanel } from "@/panels/ImportsPanel";

export function App() {
  return (
    <div className="min-h-dvh px-4 py-10">
      <main className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">react-use-wasm</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Typed React hooks for WebAssembly. Each section runs the same naive recursive{" "}
                <code className="font-mono">fib</code> twice, once in JavaScript and once in the{" "}
                <code className="font-mono">examples/go</code> module built with TinyGo for{" "}
                <code className="font-mono">wasm-unknown</code>.
              </p>
            </div>
            <ThemeToggle />
          </div>
          <Heartbeat />
        </header>

        <MainThreadPanel />
        <WorkerPanel />
        <ImportsPanel />
      </main>
    </div>
  );
}
