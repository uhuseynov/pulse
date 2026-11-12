"use client";

import type { ServerSummary } from "@/lib/types";
import { initials } from "./avatar";

export function ServerRail({
  servers,
  activeServerId,
  unreadServers,
  onSelect,
  onCreate,
  onJoin,
}: {
  servers: ServerSummary[];
  activeServerId: string | null;
  unreadServers: Record<string, true>;
  onSelect: (serverId: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <nav
      aria-label="Servers"
      className="flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-[#07080b] py-3"
    >
      {servers.map((server) => {
        const active = server.id === activeServerId;
        return (
          <button
            key={server.id}
            type="button"
            title={server.name}
            aria-label={server.name}
            aria-current={active ? "true" : undefined}
            onClick={() => onSelect(server.id)}
            className={`relative flex h-12 w-12 shrink-0 items-center justify-center text-sm font-semibold transition-all ${
              active
                ? "rounded-2xl bg-indigo-600"
                : "rounded-3xl bg-white/[0.06] hover:rounded-2xl hover:bg-indigo-600"
            }`}
          >
            {initials(server.name)}
            {unreadServers[server.id] && !active && (
              <span
                aria-label="Unread messages"
                className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#07080b] bg-rose-500"
              />
            )}
          </button>
        );
      })}

      {servers.length > 0 && <span className="my-1 h-px w-8 bg-white/10" />}

      <button
        type="button"
        title="Create a server"
        aria-label="Create a server"
        onClick={onCreate}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl bg-white/[0.06] text-2xl text-emerald-400 transition-all hover:rounded-2xl hover:bg-emerald-600 hover:text-white"
      >
        +
      </button>
      <button
        type="button"
        title="Join a server"
        aria-label="Join a server"
        onClick={onJoin}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl bg-white/[0.06] text-lg text-emerald-400 transition-all hover:rounded-2xl hover:bg-emerald-600 hover:text-white"
      >
        →
      </button>
    </nav>
  );
}
