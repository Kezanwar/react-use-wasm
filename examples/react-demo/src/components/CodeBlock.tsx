import { Check, Copy, FileCode2 } from "lucide-react";
import { useState } from "react";
import { Highlight, type PrismTheme } from "prism-react-renderer";
import { cn } from "cn";

/**
 * An empty theme. prism-react-renderer wants one, but inline styles would
 * hard-code colours and break dark mode, so we take only its token
 * classNames and do the colouring in styles.css with the page's own
 * palette.
 */
const NO_INLINE_THEME: PrismTheme = { plain: {}, styles: [] };

/**
 * Just the highlighted source, no frame. Split out so signatures and other
 * bare snippets colour the same way as a full code block; `.code-block` is
 * what the token rules in styles.css hang off.
 */
export function HighlightedCode({
  code,
  language = "tsx",
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  return (
    <Highlight code={code.trim()} language={language} theme={NO_INLINE_THEME}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre className={cn("code-block overflow-x-auto", className)}>
          <code>
            {tokens.map((line, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  );
}

/**
 * Highlighted source in an editor-style frame. The chrome is the point: in
 * a page where prose already contains coloured identifiers, a block needs a
 * border and a title bar to read as "this is a file", not "this is a
 * sentence".
 */
export function CodeBlock({
  code,
  label = "JavaScript",
  language = "jsx",
  className,
}: {
  code: string;
  label?: string;
  language?: string;
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
              <Check className="size-3.5 text-emerald-500" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Copy
            </>
          )}
        </button>
      </div>

      <HighlightedCode
        code={code}
        language={language}
        className="bg-card p-3.5 text-[12.5px] leading-relaxed"
      />
    </div>
  );
}
