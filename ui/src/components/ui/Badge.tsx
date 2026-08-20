import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import type { FrostVariant } from "./GlassCard";

const colorMap: Record<FrostVariant, string> = {
  blue: "bg-blue-500/15 text-blue-300 border-blue-400/30",
  green: "bg-green-500/15 text-green-300 border-green-400/30",
  orange: "bg-orange-500/15 text-orange-300 border-orange-400/30",
  red: "bg-red-500/15 text-red-300 border-red-400/30",
  cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-400/30",
  purple: "bg-purple-500/15 text-purple-300 border-purple-400/30",
  neutral: "bg-white/10 text-white/70 border-white/20",
};

export default function Badge({
  children,
  variant = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  variant?: FrostVariant;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        colorMap[variant],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", colorMap[variant].split(" ")[1].replace("text-", "bg-"))} />}
      {children}
    </span>
  );
}
