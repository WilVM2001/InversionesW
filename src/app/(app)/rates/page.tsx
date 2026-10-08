import { requirePermission, can } from "@/server/auth";
import { listRates } from "@/server/queries";
import { toggleRateAction } from "@/server/actions";
import { RateForm } from "@/components/rate-form";
import { formatRate, formatPercent, Badge } from "@/components/format";
import { frequencyLabel } from "@/domain/dates";
import type { Frequency } from "@/domain/types";

export default async function RatesPage() {
  const user = await requirePermission("rates:read");
  const rates = await listRates();
  const canWrite = can(user.role, "rates:write");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Tasas</h1>
        <p className="mt-1 text-sm text-ink-500">
          Catálogo de condiciones. Cada préstamo copia la tasa que tenga el momento de
          crearse, así que cambiar una tasa aquí no altera los préstamos ya feitos.
        </p>
      </header>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs text-ink-500">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Tasa</th>
              <th className="px-4 py-3 font-medium">Periodicidad</th>
              <th className="px-4 py-3 font-medium">Método</th>
              <th className="px-4 py-3 font-medium">Mora</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              {canWrite ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rates.map((r) => (
              <tr key={r.id} className={r.isActive ? undefined : "opacity-50"}>
                <td className="px-4 py-3">
                  <p className="font-medium text-ink-900">{r.name}</p>
                  {r.description ? (
                    <p className="text-xs text-ink-500">{r.description}</p>
                  ) : null}
                </td>
                <td className="tabular px-4 py-3 font-medium">
                  {formatRate(Number(r.rate))}
                </td>
                <td className="px-4 py-3 text-ink-600">
                  {frequencyLabel(r.frequency as Frequency)}
                </td>
                <td className="px-4 py-3 text-xs text-ink-600">
                  {r.amortizationMethod === "ORIGINAL_CAPITAL"
                    ? "Capital original"
                    : "Saldo insoluto"}
                  <p className="text-ink-500">
                    {r.interestType === "SIMPLE" ? "Interés simple" : "Interés compuesto"}
                  </p>
                </td>
                <td className="tabular px-4 py-3 text-ink-600">
                  {Number(r.moraDailyRatePercent) > 0
                    ? `${formatPercent(r.moraDailyRatePercent)} diaria`
                    : "Sin mora"}
                  {r.moraGraceDays > 0 ? (
                    <p className="text-xs text-ink-500">{r.moraGraceDays} día(s) gracia</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    className={
                      r.isActive
                        ? "bg-positive-500/10 text-positive-600 ring-positive-500/25"
                        : "bg-ink-100 text-ink-500 ring-ink-200"
                    }
                  >
                    {r.isActive ? "Activa" : "Inactiva"}
                  </Badge>
                </td>
                {canWrite ? (
                  <td className="px-4 py-3 text-right">
                    <form action={toggleRateAction} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        {r.isActive ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {rates.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-500">
            No hay tasas configuradas. Crea la primera para empezar a otorgar préstamos.
          </p>
        ) : null}
      </section>

      {canWrite ? (
        <section className="card p-6">
          <h2 className="text-base font-semibold text-ink-900">Nueva tasa</h2>
          <p className="mt-1 mb-5 text-sm text-ink-500">
            La tasa se guarda como fracción: escribe 2 para 2%, nunca 0.02.
          </p>
          <RateForm />
        </section>
      ) : null}
    </div>
  );
}