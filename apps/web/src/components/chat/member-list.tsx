import type { Member } from "@/lib/types";
import { Avatar } from "./avatar";

function MemberRow({ member }: { member: Member }) {
  return (
    <li
      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${
        member.online ? "" : "opacity-50"
      }`}
    >
      <Avatar
        id={member.user.id}
        name={member.user.displayName}
        online={member.online}
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
    </li>
  );
}

export function MemberList({ members }: { members: Member[] }) {
  const online = members.filter((member) => member.online);
  const offline = members.filter((member) => !member.online);

  return (
    <aside className="hidden w-60 shrink-0 overflow-y-auto bg-[#11141b] px-2 py-3 lg:block">
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
                  <MemberRow key={member.id} member={member} />
                ))}
              </ul>
            </section>
          ),
      )}
    </aside>
  );
}
