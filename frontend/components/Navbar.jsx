"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ROLE_LABEL, isStaff, useAuth } from "@/lib/auth";
import { Avatar } from "./ui";
import Icon, { LogoMark } from "./Icons";

const LINKS = [
  { href: "/problems", label: "Practice", icon: "code" },
  { href: "/courses", label: "Courses", icon: "book-open" },
  // Reels is hidden for now; put this line back to show the tab again.
  // { href: "/reels", label: "Reels", icon: "film" },
  { href: "/quiz", label: "Quiz", icon: "zap" },
  { href: "/leaderboard", label: "Leaderboard", icon: "trophy" },
];

export default function Navbar() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef(null);

  const links = [
    ...LINKS,
    ...(user ? [{ href: "/classroom", label: "Classroom", icon: "users" }] : []),
    ...(user ? [{ href: "/submissions", label: "Submissions", icon: "activity" }] : []),
    ...(isStaff(user) ? [{ href: "/manage", label: "Question Manager", icon: "edit" }] : []),
    ...(user?.role === "ADMIN" ? [{ href: "/admin", label: "Admin", icon: "shield" }] : []),
  ];
  const active = (href) => pathname === href || pathname.startsWith(`${href}/`);

  // Close menus on navigation, on outside click and on Escape.
  useEffect(() => {
    setMenu(false);
    setMobile(false);
  }, [pathname]);
  useEffect(() => {
    const onDown = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenu(false);
    const onKey = (e) => e.key === "Escape" && (setMenu(false), setMobile(false));
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const signOut = () => {
    logout();
    setMenu(false);
    router.push("/");
  };

  // A class room is a full-screen app with its own top bar.
  if (/^\/classroom\/[^/]+$/.test(pathname)) return null;

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-colors duration-300 ${
        scrolled || mobile ? "border-white/[0.08] bg-ink-950/85 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl" : "border-transparent bg-ink-950/40 backdrop-blur-md"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="group flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-white">
          <LogoMark className="h-8 w-8 transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-105" />
          <span>
            Quantum<span className="text-gradient"> Code</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 lg:ml-4 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`nav-tab ${active(l.href) ? "nav-tab-active" : ""}`} aria-current={active(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {loading ? (
            <div className="h-9 w-24 skeleton" />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenu((m) => !m)}
                aria-haspopup="menu"
                aria-expanded={menu}
                className="flex items-center gap-2 rounded-xl border border-transparent py-1 pl-1 pr-2 transition hover:border-white/[0.08] hover:bg-white/[0.04]"
              >
                <Avatar user={user} size={32} />
                <span className="hidden max-w-[10rem] truncate text-sm font-medium text-slate-200 sm:inline">{user.name || user.username}</span>
                <Icon name="chevron-down" className={`hidden h-3.5 w-3.5 text-slate-400 transition sm:block ${menu ? "rotate-180" : ""}`} />
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 mt-2 w-60 animate-scale-in origin-top-right overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900/95 p-1.5 shadow-card-hover backdrop-blur-xl">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar user={user} size={36} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{user.name || user.username}</div>
                      <div className="truncate text-xs text-slate-400">@{user.username}</div>
                    </div>
                    {user.role !== "USER" && <span className="pill ml-auto bg-brand-500/15 text-brand-300">{ROLE_LABEL[user.role] || user.role}</span>}
                  </div>
                  <div className="my-1 h-px bg-white/[0.06]" />
                  {[
                    [`/u/${user.username}`, "My profile", "user"],
                    ["/submissions", "Submissions", "activity"],
                    ["/settings", "Edit profile", "settings"],
                  ].map(([href, label, icon]) => (
                    <Link key={href} href={href} role="menuitem" onClick={() => setMenu(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-white/[0.06] hover:text-white">
                      <Icon name={icon} className="h-4 w-4 text-slate-400" />
                      {label}
                    </Link>
                  ))}
                  <div className="my-1 h-px bg-white/[0.06]" />
                  <button role="menuitem" onClick={signOut} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-rose-500/10">
                    <Icon name="log-out" className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login" className="btn-ghost hidden sm:inline-flex">
                Log in
              </Link>
              <Link href="/register" className="btn-primary">
                Get started
                <Icon name="arrow-right" className="h-4 w-4" />
              </Link>
            </>
          )}
          <button
            className="btn-icon btn-ghost lg:hidden"
            onClick={() => setMobile((m) => !m)}
            aria-label={mobile ? "Close menu" : "Open menu"}
            aria-expanded={mobile}
          >
            <Icon name={mobile ? "x" : "menu"} className="h-5 w-5" />
          </button>
        </div>
      </nav>

      {mobile && (
        <div className="animate-fade-in border-t border-white/[0.06] px-4 pb-4 pt-2 lg:hidden">
          <div className="grid gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active(l.href) ? "bg-brand-500/15 text-white" : "text-slate-300 hover:bg-white/[0.05] hover:text-white"}`}
              >
                <Icon name={l.icon} className={`h-4 w-4 ${active(l.href) ? "text-brand-300" : "text-slate-500"}`} />
                {l.label}
              </Link>
            ))}
            {!user && !loading && (
              <Link href="/login" className="btn-ghost mt-2 w-full">
                Log in
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
