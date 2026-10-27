import { useEffect, useRef, useState } from "react";

/**
 * Proof that the main thread is free. The counter only advances if frames
 * are being painted, so it stalls the instant anything blocks the main
 * thread (try the main-thread panel with n = 40).
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
    <div className="heartbeat">
      <span className="spinner" aria-hidden="true" />
      <span data-testid="frames">frames painted: {frames}</span>
    </div>
  );
}
