import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export type FrostVariant = "blue" | "blue-bg" | "green" | "orange" | "red" | "cyan" | "purple" | "neutral";

const variantClass: Record<FrostVariant, string> = {
  blue: "frost-blue",
  "blue-bg": "frost-blue-bg",
  green: "frost-green",
  orange: "frost-orange",
  red: "frost-red",
  cyan: "frost-cyan",
  purple: "frost-purple",
  neutral: "frost-blue",
};

interface FrostCardProps {
  variant?: FrostVariant;
  className?: string;
  children: ReactNode;
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  subtitle?: string;
  padded?: boolean;
}

export default function FrostCard({
  variant = "blue",
  className,
  children,
  title,
  icon,
  action,
  subtitle,
  padded = true,
}: FrostCardProps) {
  return (
    <div className={cn("frost-card", variantClass[variant], padded ? "p-4 sm:p-5" : "", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {icon && <span className="shrink-0 text-blue-200/80">{icon}</span>}
            <div className="min-w-0">
              {title && <h3 className="truncate text-sm font-semibold tracking-wide text-white/92">{title}</h3>}
              {subtitle && <p className="truncate text-xs text-white/42">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
