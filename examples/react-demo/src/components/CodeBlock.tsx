import { Check, Copy, FileCode2 } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";

/**
 * Plain, unhighlighted source in an editor-style frame. The chrome is the
 * point: in a page where prose already contains coloured identifiers, a
 * block needs a border and a title bar to read as "this is a file", not
 * "this is a sentence".
 */
export function CodeBlock({
  code,
  label = "JavaScript",
  className,
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={cn("border-border overflow-hidden rounded-xl border shadow-sm", className)}>
      <div className="border-border bg-muted flex items-center gap-2 border-b py-1.5 pr-1.5 pl-3">
        <FileCode2 className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
          {label}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="text-muted-foreground hover:bg-background hover:text-foreground ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
        >
          {copied ? (
            <>
              <Check className="size-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Copy
            </>
          )}
        </button>
      </div>

      <pre className="bg-card text-foreground/85 overflow-x-auto p-3.5 text-[12.5px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
