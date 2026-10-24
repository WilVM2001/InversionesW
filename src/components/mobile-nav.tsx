"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Wallet,
  Percent,
  FileText,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/loans", label: "Préstamos", icon: Wallet },
  { href: "/rates", label: "Tasas", icon: Percent },
  { href: "/reports", label: "Reportes", icon: FileText },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-ink-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden shadow-lg">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2.5 py-1 transition active:scale-95 min-w-[54px] min-h-[44px] ${
              active
                ? "text-brand-600 font-bold"
                : "text-ink-500 hover:text-ink-900 font-medium"
            }`}
          >
            <Icon size={20} className={active ? "text-brand-600" : "text-ink-400"} />
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
