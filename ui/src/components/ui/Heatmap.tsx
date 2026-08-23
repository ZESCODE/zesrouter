export default function Heatmap({
  values,
  cols = 24,
  title,
}: {
  values: number[];
  cols?: number;
  title?: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div>
      {title && <p className="mb-2 text-[11px] uppercase tracking-wide text-white/40">{title}</p>}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {values.map((v, i) => {
          const t = v / max;
          const bg = v === 0 ? "rgba(255,255,255,0.04)" : `rgba(59,130,246,${0.18 + t * 0.75})`;
          return (
            <div
              key={i}
              title={`${v}`}
              className="aspect-square rounded-[3px]"
              style={{ background: bg, boxShadow: t > 0.6 ? "0 0 8px rgba(59,130,246,0.45)" : undefined }}
            />
          );
        })}
      </div>
    </div>
  );
}
