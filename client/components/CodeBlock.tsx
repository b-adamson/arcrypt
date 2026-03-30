'use client';

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

type CodeBlockProps = {
  code: string;
  language?: string;
};

export default function CodeBlock({ code, language = "tsx" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  return (
    <div
      className="
      relative overflow-hidden border border-white/10 bg-black
      shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_20px_60px_rgba(0,0,0,0.7)]
    "
    >
      {/* Copy button */}
      <button
        onClick={handleCopy}
        className="
        absolute top-3 right-3 z-10
        text-xs font-medium text-white/70
        border border-white/10 bg-white/[0.04]
        px-3 py-1 transition
        hover:bg-white/[0.08] hover:border-white/20 hover:text-white
      "
      >
        {copied ? "Copied" : "Copy"}
      </button>

      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          background: "#000000",
          padding: "1.25rem",
          paddingTop: "2.5rem", // 👈 space for button
          fontSize: "0.9rem",
          lineHeight: "1.65",
        }}
        codeTagProps={{
          style: {
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}