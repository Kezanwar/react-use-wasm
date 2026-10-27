import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";

/**
 * Proof that the main thread is free. The counter only advances if frames
 * are being painted, so it stalls the instant anything blocks the main
 * thread (try the useWasm panel with n = 40).
 */
export function Heartbeat() {
  const [frames, setFrames] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const tick = () => {
      setFrames((f) => f + 1);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  return (
    <div className="border-border bg-card inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-sm">
      <span
        aria-hidden="true"
        className="border-primary/25 border-t-primary size-3.5 rounded-full border-2"
        style={{ animation: "spin-slow 0.7s linear infinite" }}
      />
      <Activity className="text-muted-foreground size-3.5" />
      <span className="tabular" data-testid="frames">
        frames painted: <span className="font-semibold">{frames}</span>
      </span>
    </div>
  );
}
