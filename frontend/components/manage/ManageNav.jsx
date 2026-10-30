"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "../ui";
import Icon from "../Icons";

export default function ManageNav({ inReview = 0 }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const tabs = [
    ["/manage", "Questions", "list"],
    ["/manage/structure", "Structure", "git-branch"],
    ["/manage/reels", "Reels", "film"],
    ["/manage/bulk", "Bulk upload", "download"],
    ...(user?.role === "ADMIN" ? [["/manage/review", "Review queue", "check-circle"]] : []),
  ];
  const active = (href) => pathname === href || (href === "/manage/reels" && pathname.startsWith(href));
  return (
    <div className="mb-6">
      <PageHeader
        eyebrow={
          <>
            <Icon name="edit" className="h-3.5 w-3.5" /> {user?.role === "ADMIN" ? "Admin" : "Editor"}
          </>
        }
        title="Question Manager"
        subtitle={
          user?.role === "ADMIN"
            ? "You're an admin: you can publish directly and review editors' work."
            : "You're an editor: your questions go live after an admin approves them."
        }
        actions={
          <>
            <Link href="/manage/reels/new" className="btn-ghost">
              <Icon name="film" className="h-4 w-4" /> New reel
            </Link>
            <Link href="/manage/new" className="btn-primary">
              <Icon name="plus" className="h-4 w-4" /> New question
            </Link>
          </>
        }
      />
      <div className="mt-5 overflow-x-auto">
        <div className="segmented min-w-max">
          {tabs.map(([href, label, icon]) => (
            <Link key={href} href={href} className={`tab ${active(href) ? "tab-active" : ""}`}>
              <Icon name={icon} className="h-3.5 w-3.5" />
              {label}
              {href === "/manage/review" && inReview > 0 && <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">{inReview}</span>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
