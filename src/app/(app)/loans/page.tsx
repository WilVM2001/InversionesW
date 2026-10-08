import Link from "next/link";
import { requirePermission } from "@/server/auth";
import { listLoans } from "@/server/queries";
import { formatCOP, formatRate, LOAN_STYLES, Badge } from "@/components/format";
import { EmptyState } from "@/components/ui";

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
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePermission("loans:read");
  const { status } = await searchParams;
  const loans = await listLoans(status);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Préstamos</h1>
          <p className="mt-1 text-sm text-ink-500">{loans.length} préstamo(s)</p>
        </div>
        <Link
          href="/loans/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Nuevo préstamo
        </Link>
      </header>

      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = (status ?? "TODOS") === f.key;
          return (
            <Link
              key={f.key}
              href={f.key === "TODOS" ? "/loans" : `/loans?status=${f.key}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "bg-ink-900 text-white"
                  : "bg-white text-ink-600 ring-1 ring-ink-200 ring-inset hover:bg-ink-50"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {loans.length === 0 ? (
        <EmptyState
          title="No hay préstamos"
          description="Crea un préstamo para generar su cronograma de amortización."
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
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs text-ink-500">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Condiciones</th>
                <th className="px-4 py-3 text-right font-medium">Capital</th>
                <th className="px-4 py-3 text-right font-medium">Capital pendiente</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {loans.map((loan) => {
                const pending = loan.installments.reduce(
                  (a, i) => a + Math.max(0, Number(i.principal) - Number(i.paidPrincipal)),
                  0,
                );
                const style = LOAN_STYLES[loan.status] ?? LOAN_STYLES.VIGENTE;
                return (
                  <tr key={loan.id} className="hover:bg-ink-50">
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
                        className="text-ink-900 hover:text-brand-600"
                      >
                        {loan.client.firstName} {loan.client.lastName}
                      </Link>
                      <p className="tabular text-xs text-ink-500">
                        {loan.client.documentId}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-600">
                      <p className="tabular">
                        {formatRate(Number(loan.rateSnapshot))}{" "}
                        {loan.frequencySnapshot.toLowerCase()}
                      </p>
                      <p>
                        {loan.termPeriods} cuota(s) ·{" "}
                        {loan.methodSnapshot === "ORIGINAL_CAPITAL"
                          ? "capital original"
                          : "saldo insoluto"}
                      </p>
                    </td>
                    <td className="tabular px-4 py-3 text-right">
                      {formatCOP(loan.principal)}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-medium">
                      {formatCOP(pending)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={style.className}>{style.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}