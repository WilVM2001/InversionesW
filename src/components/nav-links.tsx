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

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "reports:read" },
  { href: "/clients", label: "Clientes", icon: Users, permission: "clients:read" },
  { href: "/loans", label: "Préstamos", icon: Wallet, permission: "loans:read" },
  { href: "/rates", label: "Tasas", icon: Percent, permission: "rates:read" },
  { href: "/reports", label: "Reportes", icon: FileText, permission: "reports:read" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="space-y-1">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-brand-600 text-white"
                  : "text-ink-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}