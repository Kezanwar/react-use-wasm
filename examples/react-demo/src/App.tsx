import { Heartbeat } from "./Heartbeat";
import { MainThreadPanel } from "./MainThreadPanel";
import { WorkerPanel } from "./WorkerPanel";
import { ImportsPanel } from "./ImportsPanel";

export function App() {
  return (
    <main>
      <header>
        <h1>react-use-wasm</h1>
        <p className="sub">
          Typed React hooks for WebAssembly. The module below is{" "}
          <code>examples/go/math.go</code>, built with TinyGo for{" "}
          <code>wasm-unknown</code>.
        </p>
        <Heartbeat />
      </header>

      <MainThreadPanel />
      <WorkerPanel />
      <ImportsPanel />
    </main>
  );
}
