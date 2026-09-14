"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Heart, ListChecks, User, SlidersHorizontal, Settings, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/discover", label: "Discover", icon: Heart },
  { href: "/applications", label: "Applications", icon: ListChecks },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/preferences", label: "Preferences", icon: SlidersHorizontal },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_ITEMS = NAV_ITEMS.filter((item) => item.href !== "/preferences" && item.href !== "/settings");

export function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-100 bg-white px-4 py-6 sm:flex">
      <Link href="/discover" className="mb-8 flex items-center gap-2 px-2 text-lg font-bold tracking-tight text-slate-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">S</span>
        Sqwer
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"
      >
        <LogOut className="h-4.5 w-4.5" />
        Log out
      </button>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-100 bg-white/95 backdrop-blur sm:hidden">
      {MOBILE_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              active ? "text-brand-600" : "text-slate-400"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
