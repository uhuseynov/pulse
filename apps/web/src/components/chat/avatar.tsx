import type { PresenceStatus } from "@/lib/types";

const COLORS = [
  "bg-indigo-600",
  "bg-emerald-600",
  "bg-rose-600",
  "bg-amber-600",
  "bg-sky-600",
  "bg-fuchsia-600",
  "bg-teal-600",
];

/** A stable colour per user or server, derived from its id. */
function colorFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? words[0][0] + words[1][0] : name.trim().slice(0, 2);
  return letters.toUpperCase();
}

const STATUS_COLORS: Record<PresenceStatus, string> = {
  online: "bg-emerald-500",
  idle: "bg-amber-400",
  offline: "bg-gray-500",
};

const STATUS_LABELS: Record<PresenceStatus, string> = {
  online: "Online",
  idle: "Idle",
  offline: "Offline",
};

export function Avatar({
  id,
  name,
  status,
  size = "md",
}: {
  id: string;
  name: string;
  /** Shows a status dot when defined. */
  status?: PresenceStatus;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden
        className={`flex items-center justify-center rounded-full font-semibold ${box} ${colorFor(id)}`}
      >
        {initials(name)}
      </span>
      {status !== undefined && (
        <span
          role="img"
          aria-label={STATUS_LABELS[status]}
          title={STATUS_LABELS[status]}
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#11141b] ${STATUS_COLORS[status]}`}
        />
      )}
    </span>
  );
}
