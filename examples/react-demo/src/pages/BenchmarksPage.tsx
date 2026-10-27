import { MainThreadPanel } from "@/panels/MainThreadPanel";
import { WorkerPanel } from "@/panels/WorkerPanel";
import { ImportsPanel } from "@/panels/ImportsPanel";

export function BenchmarksPage() {
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Each panel runs the same naive recursive <code className="font-mono">fib</code> twice, once
        in JavaScript and once in the TinyGo module. Both sides are warmed up first and run
        sequentially, so the only variable is the language.
      </p>

      <MainThreadPanel />
      <WorkerPanel />
      <ImportsPanel />
    </div>
  );
}
