"use client";

import { useState } from "react";
import type { Friend, FriendRequest, FriendsOverview } from "@/lib/types";
import { Avatar } from "./avatar";

type Tab = "all" | "pending" | "add";

type RequestResult = { error: string } | { accepted: boolean };

const STATUS_TEXT = { online: "Online", idle: "Idle", offline: "Offline" };

function Row({
  person,
  detail,
  status,
  children,
}: {
  person: FriendRequest;
  detail: string;
  status?: Friend["status"];
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.04]">
      <Avatar
        id={person.user.id}
        name={person.user.displayName}
        status={status}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{person.user.displayName}</p>
        <p className="truncate text-xs text-gray-400">{detail}</p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </li>
  );
}

function RowButton({
  children,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium ${
        danger
          ? "text-gray-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
          : "text-gray-200 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-10 text-center text-sm text-gray-500">{children}</p>
  );
}

function AddFriend({
  onRequest,
}: {
  onRequest: (username: string) => Promise<RequestResult>;
}) {
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    { ok: true; text: string } | { ok: false; text: string } | null
  >(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const name = username.trim();
    if (!name || pending) return;
    setPending(true);
    const outcome = await onRequest(name);
    setPending(false);
    if ("error" in outcome) {
      setResult({ ok: false, text: outcome.error });
      return;
    }
    setUsername("");
    setResult({
      ok: true,
      text: outcome.accepted
        ? `You and ${name} are now friends.`
        : `Friend request sent to ${name}.`,
    });
  }

  return (
    <form onSubmit={submit} className="px-3 py-4">
      <h3 className="font-semibold">Add a friend</h3>
      <p className="mt-1 text-sm text-gray-400">
        Enter their username. It is shown under their name, after the @.
      </p>
      <div className="mt-4 flex gap-2">
        <input
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            setResult(null);
          }}
          maxLength={25}
          placeholder="username"
          aria-label="Username"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-4 py-2.5 text-sm placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !username.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send request"}
        </button>
      </div>
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`mt-3 text-sm ${result.ok ? "text-emerald-300" : "text-red-300"}`}
        >
          {result.text}
        </p>
      )}
    </form>
  );
}

/** The friends page: everyone you know, pending requests, and adding more. */
export function FriendsPane({
  friends,
  onMessage,
  onRequest,
  onAccept,
  onRemove,
}: {
  friends: FriendsOverview | null;
  onMessage: (userId: string) => void;
  onRequest: (username: string) => Promise<RequestResult>;
  onAccept: (friendshipId: string) => void;
  /** Removes a friend, declines a request or cancels one. */
  onRemove: (friendshipId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const pendingCount = friends
    ? friends.incoming.length + friends.outgoing.length
    : 0;

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    {
      id: "pending",
      label: pendingCount ? `Pending (${pendingCount})` : "Pending",
    },
    { id: "add", label: "Add friend" },
  ];

  // Whoever is around comes first.
  const order = { online: 0, idle: 1, offline: 2 };
  const sorted = [...(friends?.friends ?? [])].sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      a.user.displayName.localeCompare(b.user.displayName),
  );

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#171a22]">
      <header className="flex items-center gap-4 border-b border-white/10 px-4 py-2.5">
        <h2 className="font-semibold">Friends</h2>
        <div role="tablist" className="flex gap-1">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                tab === id
                  ? id === "add"
                    ? "bg-indigo-600 text-white"
                    : "bg-white/10 text-white"
                  : id === "add"
                    ? "text-indigo-300 hover:bg-white/5"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-2 py-3">
        {!friends ? (
          <Empty>Loading…</Empty>
        ) : tab === "add" ? (
          <AddFriend onRequest={onRequest} />
        ) : tab === "all" ? (
          sorted.length === 0 ? (
            <Empty>
              No friends yet. Use “Add friend” to send your first request.
            </Empty>
          ) : (
            <ul>
              {sorted.map((friend) => (
                <Row
                  key={friend.id}
                  person={friend}
                  status={friend.status}
                  detail={`@${friend.user.username} · ${STATUS_TEXT[friend.status]}`}
                >
                  <RowButton onClick={() => onMessage(friend.user.id)}>
                    Message
                  </RowButton>
                  <RowButton
                    danger
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${friend.user.displayName} from your friends?`,
                        )
                      ) {
                        onRemove(friend.id);
                      }
                    }}
                  >
                    Remove
                  </RowButton>
                </Row>
              ))}
            </ul>
          )
        ) : pendingCount === 0 ? (
          <Empty>No pending requests.</Empty>
        ) : (
          <ul>
            {friends.incoming.map((request) => (
              <Row
                key={request.id}
                person={request}
                detail={`@${request.user.username} · wants to be your friend`}
              >
                <RowButton onClick={() => onAccept(request.id)}>
                  Accept
                </RowButton>
                <RowButton danger onClick={() => onRemove(request.id)}>
                  Decline
                </RowButton>
              </Row>
            ))}
            {friends.outgoing.map((request) => (
              <Row
                key={request.id}
                person={request}
                detail={`@${request.user.username} · request sent`}
              >
                <RowButton danger onClick={() => onRemove(request.id)}>
                  Cancel
                </RowButton>
              </Row>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
