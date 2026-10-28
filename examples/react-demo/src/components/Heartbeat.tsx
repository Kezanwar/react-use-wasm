import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity } from "lucide-react";

/**
 * Proof that the main thread is free. The counter only advances if frames
 * are being painted, so it stalls the instant anything blocks the main
 * thread (try the useWasm panel with n = 40).
 *
 * It is only useful while you can see it, and the panels are taller than a
 * screen, so once the inline pill scrolls away a copy pins itself to the
 * bottom-right corner.
 */
export function Heartbeat() {
  const [frames, setFrames] = useState(0);
  const [offScreen, setOffScreen] = useState(false);
  const inline = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const tick = () => {
      setFrames((f) => f + 1);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  useEffect(() => {
    const el = inline.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOffScreen(!entry?.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pill = (testId: string) => (
    <div className="border-border bg-card inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-sm">
      <span
        aria-hidden="true"
        className="border-primary/25 border-t-primary size-3.5 rounded-full border-2"
        style={{ animation: "spin-slow 0.7s linear infinite" }}
      />
      <Activity className="text-muted-foreground size-3.5" />
      <span className="tabular" data-testid={testId}>
        frames painted: <span className="font-semibold">{frames}</span>
      </span>
    </div>
  );

  return (
    <>
      {/* Stays in the flow so nothing reflows when the floating copy appears. */}
      <div ref={inline}>{pill("frames")}</div>

      {offScreen &&
        createPortal(
          <div
            className="pointer-events-none fixed right-4 bottom-4 z-50"
            style={{ animation: "float-in 0.2s ease-out" }}
            data-testid="frames-floating"
          >
            {pill("frames-pinned")}
          </div>,
          document.body
        )}
    </>
  );
}
