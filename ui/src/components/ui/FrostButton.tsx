import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

type Kind = "frost" | "ghost" | "success" | "destructive";

export default function FrostButton({
  kind = "frost",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; children: ReactNode }) {
  return (
    <button
      className={cn(
        "frost-btn",
        kind === "frost" && "frost-btn-frost",
        kind === "success" && "frost-btn-success",
        kind === "destructive" && "frost-btn-destructive",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
