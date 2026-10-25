import Link from "next/link";
import { requirePermission } from "@/server/auth";
import { listLoans } from "@/server/queries";
import { formatCOP, formatCOPWhole, formatRate, LOAN_STYLES, Badge } from "@/components/format";
import { EmptyState } from "@/components/ui";
import { Search, Eye, Pencil, CreditCard, Sparkles } from "lucide-react";

const FILTERS = [
  { key: "TODOS", label: "Todos" },
  { key: "VIGENTE", label: "Vigentes" },
  { key: "PAGADO", label: "Pagados" },
  { key: "REESTRUCTURADO", label: "Reestructurados" },
  { key: "CASTIGADO", label: "Castigados" },
];

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  await requirePermission("loans:read");
  const { status, q } = await searchParams;
  const loans = await listLoans(status, q);

  const getFilterUrl = (filterKey: string) => {
    const params = new URLSearchParams();
    if (filterKey !== "TODOS") params.set("status", filterKey);
    if (q && q.trim()) params.set("q", q.trim());
    const queryStr = params.toString();
    return queryStr ? `/loans?${queryStr}` : "/loans";
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Préstamos</h1>
          <p className="mt-1 text-sm text-ink-500">
            {loans.length} préstamo(s) {q ? `para la búsqueda "${q}"` : "registrado(s)"}
          </p>
        </div>
        <Link
          href="/loans/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 shadow-xs"
        >
          Nuevo préstamo
        </Link>
      </header>

      {/* Barra de Filtros y Buscador */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <nav className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = (status ?? "TODOS") === f.key;
            return (
              <Link
                key={f.key}
                href={getFilterUrl(f.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-ink-900 text-white shadow-xs"
                    : "bg-white text-ink-600 ring-1 ring-ink-200 ring-inset hover:bg-ink-50"
                }`}
              >
                {f.label}
              </Link>
            );
          })}
        </nav>

        <form className="relative w-full md:w-80">
          {status && status !== "TODOS" && (
            <input type="hidden" name="status" value={status} />
          )}
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              id="q"
              name="q"
              defaultValue={q ?? ""}
              className="field pl-9 pr-8 text-sm"
              placeholder="Buscar por código, cliente o cédula..."
            />
            {q && (
              <Link
                href={status && status !== "TODOS" ? `/loans?status=${status}` : "/loans"}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-400 hover:text-ink-600 p-1"
                title="Limpiar búsqueda"
              >
                ✕
              </Link>
            )}
          </div>
        </form>
      </div>

      {loans.length === 0 ? (
        <EmptyState
          title="No se encontraron préstamos"
          description={
            q
              ? `No hay préstamos que coincidan con "${q}". Intenta con otro término o limpia la búsqueda.`
              : "Crea un préstamo para generar su cronograma de amortización."
          }
          action={
            <Link
              href="/loans/new"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Nuevo préstamo
            </Link>
          }
        />
      ) : (
        <>
          {/* ========================================================= */}
          {/* VISTA MÓVIL: Tarjetas táctiles responsivas (< md:)        */}
          {/* ========================================================= */}
          <div className="space-y-3 md:hidden">
            {loans.map((loan) => {
              const pending = loan.installments.reduce(
                (a, i) => a + Math.max(0, Number(i.principal) - Number(i.paidPrincipal)),
                0,
              );
              const style = LOAN_STYLES[loan.status] ?? LOAN_STYLES.VIGENTE;
              const isBullet =
                loan.methodSnapshot === "BULLET" ||
                loan.methodSnapshot === "INTEREST_ONLY";

              return (
                <div
                  key={loan.id}
                  className="card p-4 space-y-3 border border-ink-200 shadow-xs hover:border-ink-300 transition"
                >
                  {/* Encabezado: Código y Estado */}
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/loans/${loan.id}`}
                      className="tabular font-bold text-base text-brand-600 hover:underline"
                    >
                      {loan.code}
                    </Link>
                    <Badge className={style.className}>{style.label}</Badge>
                  </div>

                  {/* Cliente */}
                  <div>
                    <Link
                      href={`/clients/${loan.clientId}`}
                      className="font-semibold text-ink-900 hover:text-brand-600 text-sm block truncate"
                    >
                      {loan.client.firstName} {loan.client.lastName}
                    </Link>
                    <p className="tabular text-xs text-ink-500 font-mono mt-0.5">
                      Doc. {loan.client.documentId}
                    </p>
                  </div>

                  {/* Condiciones */}
                  <div className="bg-ink-50/70 rounded-lg p-2.5 text-xs text-ink-700 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-ink-500">Tasa / Frecuencia:</span>
                      <span className="font-medium">
                        {formatRate(Number(loan.rateSnapshot))} {loan.frequencySnapshot.toLowerCase()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-500">Plazo / Modalidad:</span>
                      <span className="font-medium inline-flex items-center gap-1">
                        {isBullet && <Sparkles size={11} className="text-brand-600" />}
                        {loan.termPeriods} cuota(s) · {isBullet ? "Interés Puro" : "Amortizable"}
                      </span>
                    </div>
                  </div>

                  {/* Cifras financieras */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-ink-100 text-xs">
                    <div>
                      <span className="text-ink-500 block">Capital prestado</span>
                      <span className="tabular font-semibold text-ink-900 text-sm">
                        {formatCOPWhole(Number(loan.principal))}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-ink-500 block">Capital pendiente</span>
                      <span
                        className={`tabular font-bold text-sm ${
                          pending > 0 ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {formatCOPWhole(pending)}
                      </span>
                    </div>
                  </div>

                  {/* Botones de acción táctiles */}
                  <div className="flex items-center gap-2 pt-2 border-t border-ink-100">
                    <Link
                      href={`/loans/${loan.id}`}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-ink-100 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-200 transition"
                    >
                      <Eye size={13} /> Ver
                    </Link>
                    <Link
                      href={`/loans/${loan.id}/edit`}
                      className="inline-flex items-center justify-center gap-1 rounded-md bg-ink-100 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-200 transition"
                      title="Editar condiciones del préstamo"
                    >
                      <Pencil size={13} />
                    </Link>
                    {loan.status !== "PAGADO" && (
                      <Link
                        href={`/loans/${loan.id}#pago`}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-md bg-positive-600 py-1.5 text-xs font-semibold text-white hover:bg-positive-700 transition"
                      >
                        <CreditCard size={13} /> Cobrar
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ========================================================= */}
          {/* VISTA ESCRITORIO: Tabla detallada (>= md:)                */}
          {/* ========================================================= */}
          <div className="card overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs text-ink-500 bg-ink-50/50">
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Condiciones</th>
                  <th className="px-4 py-3 text-right font-medium">Capital prestado</th>
                  <th className="px-4 py-3 text-right font-medium">Capital pendiente</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {loans.map((loan) => {
                  const pending = loan.installments.reduce(
                    (a, i) => a + Math.max(0, Number(i.principal) - Number(i.paidPrincipal)),
                    0,
                  );
                  const style = LOAN_STYLES[loan.status] ?? LOAN_STYLES.VIGENTE;
                  const isBullet =
                    loan.methodSnapshot === "BULLET" ||
                    loan.methodSnapshot === "INTEREST_ONLY";

                  return (
                    <tr key={loan.id} className="hover:bg-ink-50/70 transition">
                      <td className="tabular px-4 py-3">
                        <Link
                          href={`/loans/${loan.id}`}
                          className="font-semibold text-brand-600 hover:underline"
                        >
                          {loan.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/clients/${loan.clientId}`}
                          className="text-ink-900 font-medium hover:text-brand-600 block"
                        >
                          {loan.client.firstName} {loan.client.lastName}
                        </Link>
                        <p className="tabular text-xs text-ink-500 font-mono">
                          {loan.client.documentId}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-600">
                        <p className="tabular font-medium text-ink-800">
                          {formatRate(Number(loan.rateSnapshot))}{" "}
                          {loan.frequencySnapshot.toLowerCase()}
                        </p>
                        <p className="inline-flex items-center gap-1 mt-0.5">
                          {isBullet && <Sparkles size={11} className="text-brand-600" />}
                          {loan.termPeriods} cuota(s) ·{" "}
                          {loan.methodSnapshot === "ORIGINAL_CAPITAL"
                            ? "capital original"
                            : isBullet
                              ? "interés puro / bullet"
                              : "saldo insoluto"}
                        </p>
                      </td>
                      <td className="tabular px-4 py-3 text-right text-ink-800">
                        {formatCOP(loan.principal)}
                      </td>
                      <td
                        className={`tabular px-4 py-3 text-right font-semibold ${
                          pending > 0 ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {formatCOP(pending)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={style.className}>{style.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 text-xs">
                          <Link
                            href={`/loans/${loan.id}`}
                            className="font-medium text-brand-600 hover:text-brand-800"
                          >
                            Ver
                          </Link>
                          <span className="text-ink-300">·</span>
                          <Link
                            href={`/loans/${loan.id}/edit`}
                            className="font-medium text-ink-600 hover:text-ink-900"
                          >
                            Editar
                          </Link>
                          {loan.status !== "PAGADO" && (
                            <>
                              <span className="text-ink-300">·</span>
                              <Link
                                href={`/loans/${loan.id}#pago`}
                                className="font-semibold text-positive-600 hover:text-positive-700"
                              >
                                Cobrar
                              </Link>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
