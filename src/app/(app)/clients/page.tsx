import Link from "next/link";
import { requirePermission, can } from "@/server/auth";
import { listClients } from "@/server/queries";
import { formatCOPWhole } from "@/components/format";
import { EmptyState, StatCard } from "@/components/ui";
import { DeleteClientButton } from "@/components/delete-client-button";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission("clients:read");
  const { q } = await searchParams;
  const clients = await listClients(q);

  const clientMetrics = clients.map((c) => {
    const delivered = c.loans.reduce((a, l) => a + Number(l.principal), 0);
    const recovered = c.loans.reduce(
      (a, l) => a + l.installments.reduce((x, i) => x + Number(i.paidPrincipal), 0),
      0,
    );
    const pending = c.loans.reduce(
      (a, l) =>
        a +
        l.installments.reduce(
          (x, i) => x + Math.max(0, Number(i.principal) - Number(i.paidPrincipal)),
          0,
        ),
      0,
    );
    const interestEarned = c.loans.reduce(
      (a, l) => a + l.installments.reduce((x, i) => x + Number(i.paidInterest), 0),
      0,
    );
    const moraEarned = c.loans.reduce(
      (a, l) => a + l.installments.reduce((x, i) => x + Number(i.paidMora ?? 0), 0),
      0,
    );

    return {
      client: c,
      delivered,
      recovered,
      pending,
      interestEarned,
      moraEarned,
      totalProfit: interestEarned + moraEarned,
    };
  });

  // Totales consolidados de toda la cartera de clientes
  const globalDelivered = clientMetrics.reduce((a, m) => a + m.delivered, 0);
  const globalRecovered = clientMetrics.reduce((a, m) => a + m.recovered, 0);
  const globalPending = clientMetrics.reduce((a, m) => a + m.pending, 0);
  const globalInterestEarned = clientMetrics.reduce((a, m) => a + m.interestEarned, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Clientes</h1>
          <p className="mt-1 text-sm text-ink-500">
            {clients.length} cliente(s) registrado(s) con control de capital y ganancias
          </p>
        </div>
        <Link
          href="/clients/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 shadow-xs"
        >
          Nuevo cliente
        </Link>
      </header>

      {/* Tarjetas KPI Globales de Cartera de Clientes */}
      {clients.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Capital prestado total"
            value={globalDelivered}
            hint={`${clients.length} cliente(s) activos`}
          />
          <StatCard
            label="Capital total recuperado"
            value={globalRecovered}
            tone="positive"
            hint="Retorno a capital acumulado"
          />
          <StatCard
            label="Capital pendiente activo"
            value={globalPending}
            tone={globalPending > 0 ? "warning" : "positive"}
            hint="Dinero colocado en circulación"
          />
          <StatCard
            label="Intereses ganados (Utilidad)"
            value={globalInterestEarned}
            tone="positive"
            hint="Ganancia neta real cobrada"
          />
        </section>
      )}

      <form className="max-w-md">
        <label className="label" htmlFor="q">
          Buscar por nombre o documento
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q ?? ""}
          className="field"
          placeholder="Buscar por cédula o nombre..."
        />
      </form>

      {clients.length === 0 ? (
        <EmptyState
          title="Aún no hay clientes"
          description="Registra el primer cliente para poder crear préstamos."
          action={
            <Link
              href="/clients/new"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Nuevo cliente
            </Link>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs font-semibold text-ink-600 bg-ink-50/50">
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3 text-right">Créditos</th>
                <th className="px-4 py-3 text-right">Capital prestado</th>
                <th className="px-4 py-3 text-right text-brand-700">Capital recuperado</th>
                <th className="px-4 py-3 text-right">Capital pendiente</th>
                <th className="px-4 py-3 text-right text-positive-700">Intereses ganados</th>
                <th className="px-3 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {clientMetrics.map(({ client: c, delivered, recovered, pending, interestEarned }) => {
                return (
                  <tr key={c.id} className="hover:bg-ink-50/70 transition">
                    <td className="tabular px-4 py-3 text-ink-600 font-mono text-xs">{c.documentId}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/clients/${c.id}`}
                        className="font-semibold text-ink-900 hover:text-brand-600 hover:underline"
                      >
                        {c.firstName} {c.lastName}
                      </Link>
                    </td>
                    <td className="tabular px-4 py-3 text-ink-600">{c.phone ?? "—"}</td>
                    <td className="tabular px-4 py-3 text-right text-ink-600 font-medium">
                      {c.loans.length}
                    </td>
                    <td className="tabular px-4 py-3 text-right text-ink-700">
                      {formatCOPWhole(delivered)}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-semibold text-brand-700">
                      {formatCOPWhole(recovered)}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-medium text-ink-900">
                      {formatCOPWhole(pending)}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold text-positive-700">
                      {formatCOPWhole(interestEarned)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {can(user.role, "clients:write") && (
                          <DeleteClientButton
                            clientId={c.id}
                            clientName={`${c.firstName} ${c.lastName}`}
                            documentId={c.documentId}
                            loansCount={c.loans.length}
                            variant="icon"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-ink-300 bg-ink-50 font-bold text-ink-900 text-xs">
                <td className="px-4 py-3" colSpan={4}>
                  TOTALES CONSOLIDADOS ({clients.length} clientes)
                </td>
                <td className="tabular px-4 py-3 text-right">
                  {formatCOPWhole(globalDelivered)}
                </td>
                <td className="tabular px-4 py-3 text-right text-brand-700">
                  {formatCOPWhole(globalRecovered)}
                </td>
                <td className="tabular px-4 py-3 text-right">
                  {formatCOPWhole(globalPending)}
                </td>
                <td className="tabular px-4 py-3 text-right text-positive-700">
                  {formatCOPWhole(globalInterestEarned)}
                </td>
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}