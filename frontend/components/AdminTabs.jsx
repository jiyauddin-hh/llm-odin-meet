"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icons";

const TABS = [
  ["/admin", "Problems", "code"],
  ["/manage", "Question Manager", "edit", true],
  ["/admin/courses", "Courses", "book-open"],
  ["/admin/requests", "Access requests", "unlock"],
  ["/admin/live-tests", "Live tests", "timer"],
  ["/admin/classroom", "Classroom", "video"],
  ["/admin/ai-class", "AI class", "sparkles"],
  ["/admin/users", "Users", "users"],
];

export default function AdminTabs({ pending = 0 }) {
  const pathname = usePathname();
  const active = (href) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  return (
    <div className="mb-6 overflow-x-auto">
      <div className="segmented min-w-max">
        {TABS.map(([href, label, icon, external]) => (
          <Link key={href} href={href} className={`tab ${active(href) ? "tab-active" : ""}`}>
            <Icon name={icon} className="h-3.5 w-3.5" />
            {label}
            {external && <Icon name="arrow-up-right" className="h-3 w-3 text-slate-500" />}
            {href === "/admin/requests" && pending > 0 && <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{pending}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
