import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export type FrostVariant = "blue" | "green" | "orange" | "red" | "cyan" | "purple" | "neutral";

const variantClasses: Record<FrostVariant, string> = {
  blue: "border-blue-400/25 shadow-[0_0_40px_-20px_rgba(59,130,246,0.6)]",
  green: "border-green-400/25 shadow-[0_0_40px_-20px_rgba(34,197,94,0.6)]",
  orange: "border-orange-400/25 shadow-[0_0_40px_-20px_rgba(249,115,22,0.6)]",
  red: "border-red-400/25 shadow-[0_0_40px_-20px_rgba(239,68,68,0.6)]",
  cyan: "border-cyan-400/25 shadow-[0_0_40px_-20px_rgba(34,211,238,0.6)]",
  purple: "border-purple-400/25 shadow-[0_0_40px_-20px_rgba(168,85,247,0.6)]",
  neutral: "border-white/10",
};

interface GlassCardProps {
  variant?: FrostVariant;
  className?: string;
  children: ReactNode;
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  subtitle?: string;
}

export default function GlassCard({
  variant = "neutral",
  className,
  children,
  title,
  icon,
  action,
  subtitle,
}: GlassCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-white/[0.06] p-4 backdrop-blur-xl sm:p-5",
        variantClasses[variant],
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {icon && <span className="shrink-0 text-white/70">{icon}</span>}
            <div className="min-w-0">
              {title && <h3 className="truncate text-sm font-semibold tracking-wide text-white/90">{title}</h3>}
              {subtitle && <p className="truncate text-xs text-white/40">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
