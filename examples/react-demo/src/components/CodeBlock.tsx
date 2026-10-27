import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

/** Plain, unhighlighted source. The examples are short enough to read raw. */
export function CodeBlock({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={cn("group relative", className)}>
      <pre className="bg-muted/60 border-border overflow-x-auto rounded-lg border p-3 text-[12.5px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={copy}
        aria-label="Copy code"
        className="absolute top-1.5 right-1.5 size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}
