export default function EmptyState({ text, good }: { text: string; good?: boolean }) {
  return (
    <p
      className={`rounded-xl border border-dashed p-4 text-center text-xs ${
        good ? "border-green-400/25 text-green-300/75" : "border-blue-400/20 text-white/40"
      }`}
    >
      {text}
    </p>
  );
}
