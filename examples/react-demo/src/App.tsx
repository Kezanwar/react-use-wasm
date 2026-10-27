import { CodeXml, Gauge, Puzzle } from "lucide-react";
import { Heartbeat } from "@/components/Heartbeat";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BenchmarksPage } from "@/pages/BenchmarksPage";
import { ExamplesPage } from "@/pages/ExamplesPage";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function App() {
  return (
    <div className="min-h-dvh px-4 py-10">
      <main className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">react-use-wasm</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Typed React hooks for WebAssembly, against a TinyGo module built for{" "}
                <code className="font-mono">wasm-unknown</code>.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="icon" asChild aria-label="Source on GitHub">
                <a
                  href="https://github.com/Kezanwar/react-use-wasm"
                  target="_blank"
                  rel="noreferrer"
                >
                  <CodeXml className="size-4" />
                </a>
              </Button>
              <ThemeToggle />
            </div>
          </div>
          <Heartbeat />
        </header>

        <Tabs defaultValue="benchmarks">
          <TabsList>
            <TabsTrigger value="benchmarks" data-testid="tab-benchmarks">
              <Gauge className="size-4" /> Benchmarks
            </TabsTrigger>
            <TabsTrigger value="examples" data-testid="tab-examples">
              <Puzzle className="size-4" /> Examples
            </TabsTrigger>
          </TabsList>

          <TabsContent value="benchmarks" className="mt-5">
            <BenchmarksPage />
          </TabsContent>

          <TabsContent value="examples" className="mt-5">
            <ExamplesPage />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
