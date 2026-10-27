import { Heartbeat } from "@/components/Heartbeat";
import { Js, Wasm } from "@/components/Term";
import { MainThreadPanel } from "@/panels/MainThreadPanel";
import { WorkerPanel } from "@/panels/WorkerPanel";
import { ImportsPanel } from "@/panels/ImportsPanel";

export function BenchmarksPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Each panel runs the same naive recursive <code>fib</code> twice, once in <Js /> and once
          in the TinyGo <Wasm /> module. Both sides are warmed up first and run sequentially, so
          the only variable is the language.
        </p>
        {/* Lives here rather than in the header: it only means anything next
            to the benchmarks. */}
        <Heartbeat />
      </div>

      <MainThreadPanel />
      <WorkerPanel />
      <ImportsPanel />
    </div>
  );
}
