export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-8 w-8 text-base" : "h-10 w-10 text-xl";
  const text = size === "sm" ? "text-xl" : "text-2xl";
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden
        className={`flex items-center justify-center rounded-xl bg-indigo-600 ${box}`}
      >
        ≋
      </span>
      <span className={`font-bold tracking-tight ${text}`}>pulse</span>
    </span>
  );
}
