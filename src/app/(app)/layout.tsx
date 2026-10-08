import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { logoutAction } from "@/server/actions";
import { NavLinks } from "@/components/nav-links";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  ASESOR: "Asesor",
  LECTURA: "Solo lectura",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside className="hidden w-64 shrink-0 flex-col bg-ink-950 lg:flex">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-sm font-semibold tracking-widest text-brand-400 uppercase">
            Inversiones W
          </p>
        </div>

        <nav className="flex-1 px-3 py-4">
          <NavLinks />
        </nav>

        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="text-xs text-ink-400">{ROLE_LABELS[user.role] ?? user.role}</p>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="w-full rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:bg-white/5"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 lg:hidden">
          <Link href="/dashboard" className="text-sm font-semibold text-ink-900">
            Inversiones W
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="text-xs text-ink-500 underline">
              Salir
            </button>
          </form>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}