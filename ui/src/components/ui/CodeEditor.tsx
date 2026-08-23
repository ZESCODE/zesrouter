import { useRef } from "react";

export default function CodeEditor({
  value,
  onChange,
  placeholder,
  language = "markdown",
  minHeight = 180,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  language?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const lines = Math.max(1, value.split("\n").length);

  return (
    <div className="overflow-hidden rounded-xl border border-blue-400/25 bg-black/45 shadow-[0_0_24px_-8px_rgba(59,130,246,0.55)]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-wide text-white/35">
        <span>{language}</span>
        <span>{lines} lines · {value.length} chars</span>
      </div>
      <div className="flex">
        <pre className="select-none border-r border-white/8 bg-white/[0.03] px-2 py-3 text-right font-mono text-[11px] leading-5 text-white/25">
          {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
        </pre>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className="w-full resize-y bg-transparent px-3 py-3 font-mono text-[12px] leading-5 text-blue-50/90 placeholder:text-white/25 focus:outline-none"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}
