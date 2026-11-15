"use client";

import { useState } from "react";
import type { Member, MemberRole } from "@/lib/types";
import { Avatar } from "./avatar";

export interface MemberActions {
  /** Owner only. */
  onSetRole: (member: Member, role: "ADMIN" | "MEMBER") => void;
  onKick: (member: Member) => void;
  onAddFriend: (member: Member) => void;
}

/** What the signed-in user may do to a member, given both of their roles. */
function permissions(myRole: MemberRole | undefined, target: Member) {
  return {
    changeRole: myRole === "OWNER" && target.role !== "OWNER",
    kick:
      (myRole === "OWNER" && target.role !== "OWNER") ||
      (myRole === "ADMIN" && target.role === "MEMBER"),
  };
}

function MenuItem({
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
      role="menuitem"
      onClick={onClick}
      className={`block w-full rounded px-2.5 py-1.5 text-left text-sm ${
        danger
          ? "text-red-300 hover:bg-red-500/15"
          : "text-gray-200 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function MemberRow({
  member,
  myRole,
  isSelf,
  canAddFriend,
  open,
  onToggle,
  actions,
}: {
  member: Member;
  myRole: MemberRole | undefined;
  isSelf: boolean;
  canAddFriend: boolean;
  open: boolean;
  onToggle: () => void;
  actions: MemberActions;
}) {
  const can = permissions(myRole, member);
  const hasMenu = !isSelf && (can.changeRole || can.kick || canAddFriend);
  const run = (action: () => void) => () => {
    onToggle();
    action();
  };

  return (
    <li
      className={`group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/[0.04] ${
        member.status === "offline" ? "opacity-50 hover:opacity-100" : ""
      }`}
    >
      <Avatar
        id={member.user.id}
        name={member.user.displayName}
        status={member.status}
        size="sm"
      />
      <span className="min-w-0 flex-1 truncate text-sm">
        {member.user.displayName}
      </span>
      {member.role !== "MEMBER" && (
        <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-300">
          {member.role === "OWNER" ? "Owner" : "Admin"}
        </span>
      )}
      {hasMenu && (
        <button
          type="button"
          onClick={onToggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Options for ${member.user.displayName}`}
          title="Options"
          className={`rounded px-1.5 leading-none text-gray-400 hover:bg-white/10 hover:text-white focus:opacity-100 group-hover:opacity-100 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        >
          ⋯
        </button>
      )}
      {open && (
        <div
          role="menu"
          className="absolute right-1 top-full z-30 mt-1 w-48 rounded-lg border border-white/10 bg-[#0b0d12] p-1 shadow-xl"
        >
          {canAddFriend && (
            <MenuItem onClick={run(() => actions.onAddFriend(member))}>
              Add friend
            </MenuItem>
          )}
          {can.changeRole && (
            <MenuItem
              onClick={run(() =>
                actions.onSetRole(
                  member,
                  member.role === "ADMIN" ? "MEMBER" : "ADMIN",
                ),
              )}
            >
              {member.role === "ADMIN" ? "Remove admin role" : "Make admin"}
            </MenuItem>
          )}
          {can.kick && (
            <MenuItem danger onClick={run(() => actions.onKick(member))}>
              Remove from server
            </MenuItem>
          )}
        </div>
      )}
    </li>
  );
}

export function MemberList({
  members,
  currentUserId,
  knownUserIds,
  actions,
}: {
  members: Member[];
  currentUserId: string;
  /** Friends and people with a pending request: no "Add friend" for them. */
  knownUserIds: Set<string>;
  actions: MemberActions;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const myRole = members.find((m) => m.user.id === currentUserId)?.role;
  // Idle members are still around, so they stay in the online group.
  const online = members.filter((member) => member.status !== "offline");
  const offline = members.filter((member) => member.status === "offline");

  return (
    <aside className="hidden w-60 shrink-0 overflow-y-auto bg-[#11141b] px-2 py-3 lg:block">
      {openId && (
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={-1}
          onClick={() => setOpenId(null)}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}
      {[
        { label: "Online", list: online },
        { label: "Offline", list: offline },
      ].map(
        ({ label, list }) =>
          list.length > 0 && (
            <section key={label} className="mb-4">
              <h2 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {label} — {list.length}
              </h2>
              <ul>
                {list.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    myRole={myRole}
                    isSelf={member.user.id === currentUserId}
                    canAddFriend={!knownUserIds.has(member.user.id)}
                    open={openId === member.id}
                    onToggle={() =>
                      setOpenId((current) =>
                        current === member.id ? null : member.id,
                      )
                    }
                    actions={actions}
                  />
                ))}
              </ul>
            </section>
          ),
      )}
    </aside>
  );
}
