import { cn } from "../../utils/cn";

export default function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 disabled:opacity-40",
      )}
    >
      <span
        className={cn(
          "relative h-6 w-11 rounded-full border transition",
          checked ? "border-blue-300/50 bg-blue-500/70" : "border-white/15 bg-white/10",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "left-5" : "left-0.5",
          )}
        />
      </span>
      {label && <span className="text-xs text-white/70">{label}</span>}
    </button>
  );
}
