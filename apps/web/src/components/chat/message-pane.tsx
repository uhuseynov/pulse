"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ChannelMessages } from "@/lib/chat-state";
import type { Channel, Message } from "@/lib/types";
import { Avatar } from "./avatar";

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const STICK_THRESHOLD_PX = 80;

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function typingText(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

function MessageList({ items }: { items: Message[] }) {
  return items.map((message, index) => {
    const previous = items[index - 1];
    const created = new Date(message.createdAt);
    const previousCreated = previous ? new Date(previous.createdAt) : null;
    const newDay = !previousCreated || !sameDay(created, previousCreated);
    const grouped =
      !newDay &&
      previous.author.id === message.author.id &&
      created.getTime() - previousCreated.getTime() < GROUP_WINDOW_MS;

    return (
      <div key={message.id}>
        {newDay && (
          <div className="my-4 flex items-center gap-3 px-4 text-xs text-gray-500">
            <span className="h-px flex-1 bg-white/10" />
            {dayFormat.format(created)}
            <span className="h-px flex-1 bg-white/10" />
          </div>
        )}
        <div
          className={`group flex gap-3 px-4 py-0.5 hover:bg-white/[0.02] ${
            grouped ? "" : "mt-3"
          }`}
        >
          <div className="w-10 shrink-0">
            {grouped ? (
              <span className="hidden pt-1 text-[10px] text-gray-500 group-hover:block">
                {timeFormat.format(created)}
              </span>
            ) : (
              <Avatar
                id={message.author.id}
                name={message.author.displayName}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            {!grouped && (
              <p className="flex items-baseline gap-2">
                <span className="font-medium">
                  {message.author.displayName}
                </span>
                <time
                  dateTime={message.createdAt}
                  className="text-xs text-gray-500"
                >
                  {timeFormat.format(created)}
                </time>
              </p>
            )}
            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-gray-200">
              {message.content}
            </p>
          </div>
        </div>
      </div>
    );
  });
}

export function MessagePane({
  channel,
  entry,
  typingNames,
  connected,
  onSend,
  onTyping,
  onLoadOlder,
  onRetry,
}: {
  channel: Channel;
  entry: ChannelMessages | undefined;
  typingNames: string[];
  connected: boolean;
  onSend: (content: string) => Promise<boolean>;
  onTyping: () => void;
  onLoadOlder: () => void;
  onRetry: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const previousRef = useRef<{
    firstId?: string;
    lastId?: string;
    scrollHeight: number;
  } | null>(null);

  const items = entry?.items;
  const firstId = items?.[0]?.id;
  const lastId = items?.[items.length - 1]?.id;

  // Keep the view pinned to the newest message, and keep its position when
  // older messages are added above.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const previous = previousRef.current;

    if (!previous || previous.firstId === undefined) {
      element.scrollTop = element.scrollHeight;
    } else if (previous.firstId !== firstId) {
      element.scrollTop += element.scrollHeight - previous.scrollHeight;
    } else if (previous.lastId !== lastId && stickToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
    previousRef.current = {
      firstId,
      lastId,
      scrollHeight: element.scrollHeight,
    };
  }, [firstId, lastId]);

  function onScroll() {
    const element = scrollRef.current;
    if (!element) return;
    stickToBottomRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      STICK_THRESHOLD_PX;
  }

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    stickToBottomRef.current = true;
    const sent = await onSend(content);
    if (sent) setDraft("");
    setSending(false);
  }

  const typing = typingText(typingNames);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#171a22]">
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="text-xl text-gray-500">#</span>
        <h2 className="truncate font-semibold">{channel.name}</h2>
        {!connected && (
          <span className="ml-auto rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300">
            Reconnecting…
          </span>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto pb-4"
      >
        {!entry || entry.status === "loading" ? (
          <p className="p-6 text-center text-sm text-gray-500">
            Loading messages…
          </p>
        ) : entry.status === "error" ? (
          <div className="p-6 text-center text-sm text-gray-400">
            <p>Could not load messages.</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 font-medium text-indigo-400 hover:text-indigo-300"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {entry.nextCursor ? (
              <div className="py-3 text-center">
                <button
                  type="button"
                  onClick={onLoadOlder}
                  disabled={entry.loadingOlder}
                  className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-gray-300 hover:bg-white/5 disabled:opacity-50"
                >
                  {entry.loadingOlder ? "Loading…" : "Load older messages"}
                </button>
              </div>
            ) : (
              <div className="px-4 pb-2 pt-8">
                <p className="text-2xl font-bold">Welcome to #{channel.name}</p>
                <p className="mt-1 text-sm text-gray-400">
                  This is the start of the channel.
                </p>
              </div>
            )}
            <MessageList items={entry.items} />
          </>
        )}
      </div>

      <footer className="px-4 pb-4">
        <p className="h-5 text-xs text-gray-400" aria-live="polite">
          {typing}
        </p>
        <div className="flex items-end gap-2 rounded-xl bg-white/[0.06] px-4 py-2.5">
          <textarea
            value={draft}
            rows={1}
            maxLength={4000}
            placeholder={`Message #${channel.name}`}
            aria-label={`Message #${channel.name}`}
            onChange={(event) => {
              setDraft(event.target.value);
              if (event.target.value.trim()) onTyping();
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
            className="max-h-40 min-h-6 flex-1 resize-none bg-transparent text-[15px] placeholder:text-gray-500 focus:outline-none [field-sizing:content]"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </footer>
    </section>
  );
}
