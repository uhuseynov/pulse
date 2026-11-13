/** The Pulse mark: the same drawing as the browser tab icon (app/icon.svg). */
export function PulseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" className="fill-indigo-600" />
      <path
        d="M5 17h5l3-8 5.5 15 3-7H27"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const mark = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const text = size === "sm" ? "text-xl" : "text-2xl";
  return (
    <span className="flex items-center gap-3">
      <PulseMark className={mark} />
      <span className={`font-bold tracking-tight ${text}`}>pulse</span>
    </span>
  );
}
