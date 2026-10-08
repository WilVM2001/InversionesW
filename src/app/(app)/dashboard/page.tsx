import Link from "next/link";
import {
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { requirePermission } from "@/server/auth";
import { getDashboard } from "@/server/queries";
import { refreshOverdueStatuses } from "@/server/loans";
import { formatCOP, formatCOPWhole, formatDate } from "@/components/format";
import { EmptyState } from "@/components/ui";

interface PageProps {
  searchParams?: Promise<{
    month?: string;
    days?: string;
  }>;
}

export default async function DashboardPage(props: PageProps) {
  await requirePermission("reports:read");
  await refreshOverdueStatuses();

  const searchParams = await props.searchParams;
  const selectedMonth = searchParams?.month;
  const upcomingDays = searchParams?.days ? Math.max(7, Math.min(90, parseInt(searchParams.days, 10) || 30)) : 30;

  const data = await getDashboard(selectedMonth, upcomingDays);

  // Navegación de mes (YYYY-MM)
  const [currentYear, currentMonth] = data.monthStr.split("-").map(Number);
  const prevMonthDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
  const nextMonthDate = new Date(Date.UTC(currentYear, currentMonth, 1));
  const prevMonthStr = `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const nextMonthStr = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

  const ctrl = data.monthlyControl;
  const pctAccomplished = Math.min(100, Math.round(ctrl.achievementRate * 100));

  const maxBar = Math.max(
    1,
    ...data.byMonth.map((m) => Math.max(m.principal, m.interest)),
  );

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Dashboard Financiero</h1>
          <p className="mt-1 text-sm text-ink-500">
            Control cuantitativo con separación estricta de capital recuperado vs. utilidad real.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/loans/new"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            + Nuevo préstamo
          </Link>
        </div>
      </header>

      {/* SECCIÓN 1: SEPARACIÓN CONTABLE HISTÓRICA */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wider text-ink-500 uppercase">
            Separación Contable Histórica
          </h2>
          <span className="text-xs text-ink-400">Desde el inicio de operaciones</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card border-l-4 border-l-brand-600 p-4">
            <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">
              Capital Colocado
            </p>
            <p className="tabular mt-2 text-2xl font-bold text-ink-900">
              {formatCOPWhole(data.historicalCapitalDelivered)}
            </p>
            <p className="mt-1 text-xs text-ink-500">Total de dinero desembolsado</p>
          </div>

          <div className="card border-l-4 border-l-blue-500 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">
                Capital Recuperado
              </p>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                Flujo de caja
              </span>
            </div>
            <p className="tabular mt-2 text-2xl font-bold text-blue-700">
              {formatCOPWhole(data.historicalCapitalRecovered)}
            </p>
            <p className="mt-1 text-xs text-ink-500">Retorno de principal (NO es ganancia)</p>
          </div>

          <div className="card border-l-4 border-l-positive-600 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">
                Ganancia Real Neta
              </p>
              <span className="rounded bg-positive-50 px-1.5 py-0.5 text-[10px] font-medium text-positive-700">
                Utilidad
              </span>
            </div>
            <p className="tabular mt-2 text-2xl font-bold text-positive-600">
              {formatCOPWhole(data.historicalProfit)}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              Intereses ({formatCOPWhole(data.historicalInterest)}) + Mora ({formatCOPWhole(data.historicalMora)})
            </p>
          </div>

          <div className="card border-l-4 border-l-ink-400 p-4">
            <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">
              Capital Activo en Calle
            </p>
            <p className="tabular mt-2 text-2xl font-bold text-ink-900">
              {formatCOPWhole(data.principalOutstanding)}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              {data.activeLoans} préstamo(s) vigentes · {data.clients} cliente(s)
            </p>
          </div>
        </div>
      </section>

      {/* SECCIÓN 2: CONTROL Y METAS MENSUALES */}
      <section className="card overflow-hidden p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-brand-600" />
              <h2 className="text-base font-semibold text-ink-900">
                Control de Cobro Mensual: <span className="capitalize">{data.monthLabel}</span>
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              Proyección de vencimientos calendario vs. recaudación efectiva del período.
            </p>
          </div>

          {/* Navegación por mes */}
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard?month=${prevMonthStr}&days=${upcomingDays}`}
              className="inline-flex items-center rounded-lg border border-ink-200 bg-white p-1.5 text-ink-600 hover:bg-ink-50"
              title="Mes anterior"
            >
              <ChevronLeft size={16} />
            </Link>
            <span className="tabular min-w-[90px] text-center text-xs font-semibold text-ink-700">
              {data.monthStr}
            </span>
            <Link
              href={`/dashboard?month=${nextMonthStr}&days=${upcomingDays}`}
              className="inline-flex items-center rounded-lg border border-ink-200 bg-white p-1.5 text-ink-600 hover:bg-ink-50"
              title="Mes siguiente"
            >
              <ChevronRight size={16} />
            </Link>
            <Link
              href={`/dashboard?days=${upcomingDays}`}
              className="ml-1 rounded-lg border border-ink-200 bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100"
            >
              Mes actual
            </Link>
          </div>
        </div>

        {/* Resumen de métricas del mes */}
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {/* Meta proyectada */}
          <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
            <p className="text-xs font-medium text-ink-500 uppercase">Meta Proyectada del Mes</p>
            <p className="tabular mt-2 text-2xl font-bold text-ink-900">
              {formatCOPWhole(ctrl.targetTotal)}
            </p>
            <div className="mt-3 space-y-1 text-xs text-ink-600 border-t border-ink-200/60 pt-2">
              <div className="flex justify-between">
                <span>Principal programado:</span>
                <span className="tabular font-medium">{formatCOPWhole(ctrl.targetPrincipal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Interés pactado:</span>
                <span className="tabular font-medium">{formatCOPWhole(ctrl.targetInterest)}</span>
              </div>
            </div>
          </div>

          {/* Recaudado real */}
          <div className="rounded-xl border border-positive-200 bg-positive-50/30 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-positive-800 uppercase">Recaudado Efectivo</p>
              <span className="rounded bg-positive-100 px-2 py-0.5 text-xs font-bold text-positive-700">
                {pctAccomplished}%
              </span>
            </div>
            <p className="tabular mt-2 text-2xl font-bold text-positive-700">
              {formatCOPWhole(ctrl.collectedTotal)}
            </p>
            <div className="mt-3 space-y-1 text-xs text-ink-600 border-t border-positive-200/60 pt-2">
              <div className="flex justify-between">
                <span>Capital recuperado:</span>
                <span className="tabular font-medium">{formatCOPWhole(ctrl.collectedPrincipal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Utilidad (Interés + Mora):</span>
                <span className="tabular font-medium text-positive-600">{formatCOPWhole(ctrl.collectedProfit)}</span>
              </div>
            </div>
          </div>

          {/* Cumplimiento / Brecha */}
          <div className={`rounded-xl border p-4 ${
            ctrl.isAhead
              ? "border-positive-200 bg-positive-50/30"
              : "border-warning-200 bg-warning-50/30"
          }`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase text-ink-500">
                {ctrl.isAhead ? "Superávit de Cobro" : "Diferencia / Pendiente"}
              </p>
              {ctrl.isAhead ? (
                <span className="flex items-center text-xs font-bold text-positive-600">
                  <TrendingUp className="mr-1 h-3.5 w-3.5" /> A favor
                </span>
              ) : (
                <span className="flex items-center text-xs font-bold text-warning-600">
                  <TrendingDown className="mr-1 h-3.5 w-3.5" /> Por cobrar
                </span>
              )}
            </div>
            <p className={`tabular mt-2 text-2xl font-bold ${
              ctrl.isAhead ? "text-positive-700" : "text-warning-600"
            }`}>
              {formatCOPWhole(Math.abs(ctrl.difference))}
            </p>
            <p className="mt-3 text-xs text-ink-500 border-t border-ink-200/60 pt-2">
              {ctrl.isAhead
                ? "Se ha superado la meta proyectada de cobros para este mes."
                : `Falta por recaudar ${formatCOPWhole(Math.abs(ctrl.difference))} para cumplir la meta.`}
            </p>
          </div>
        </div>

        {/* Barra de progreso de cumplimiento */}
        <div className="mt-6">
          <div className="flex justify-between text-xs font-medium text-ink-600 mb-1.5">
            <span>Progreso de cumplimiento</span>
            <span className="tabular">{pctAccomplished}% alcanzado</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-ink-100">
            <div
              className={`h-full rounded-full transition-all ${
                ctrl.isAhead ? "bg-positive-500" : pctAccomplished > 60 ? "bg-brand-500" : "bg-warning-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(2, pctAccomplished))}%` }}
            />
          </div>
        </div>
      </section>

      {/* SECCIÓN 3: RENDIMIENTO MENSUAL Y MAYOR MORA */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Gráfico apilado de histórico mensual */}
        <section className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Rendimiento de Cartera por Mes</h2>
              <p className="mt-1 text-xs text-ink-500">
                Barras apiladas: Capital devuelto (flujo) vs. Intereses y mora (utilidad real).
              </p>
            </div>
          </div>

          {data.byMonth.length === 0 ? (
            <p className="mt-8 text-sm text-ink-500">Aún no hay movimientos registrados.</p>
          ) : (
            <div className="mt-6 flex h-48 items-end gap-2">
              {data.byMonth.map((m) => {
                const total = m.principal + m.interest;
                const pct = (total / maxBar) * 100;
                const interestShare = total > 0 ? (m.interest / total) * 100 : 0;
                const isSelected = m.month === data.monthStr;
                return (
                  <Link
                    key={m.month}
                    href={`/dashboard?month=${m.month}&days=${upcomingDays}`}
                    className={`group flex flex-1 flex-col items-center gap-2 transition hover:opacity-90 ${
                      isSelected ? "scale-[1.03]" : ""
                    }`}
                  >
                    <div
                      className={`flex w-full flex-col-reverse justify-start overflow-hidden rounded-t ${
                        isSelected ? "ring-2 ring-brand-500 ring-offset-2" : "bg-ink-200"
                      }`}
                      style={{ height: `${Math.max(pct, 4)}%` }}
                      title={`${m.month}: Capital ${formatCOP(m.principal)} | Utilidad ${formatCOP(m.interest)}`}
                    >
                      <div
                        className="w-full bg-brand-600"
                        style={{ height: `${100 - interestShare}%` }}
                      />
                      <div
                        className="w-full bg-positive-500"
                        style={{ height: `${interestShare}%` }}
                      />
                    </div>
                    <span className={`tabular text-[10px] ${isSelected ? "font-bold text-brand-700" : "text-ink-500"}`}>
                      {m.month.slice(5)}/{m.month.slice(2, 4)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-5 flex gap-5 border-t border-ink-200 pt-4 text-xs text-ink-500">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Capital recuperado
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-positive-500" /> Interés y mora (Ganancia)
            </span>
          </div>
        </section>

        {/* Tarjeta de Mayor Mora */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-danger-500" />
              <h2 className="text-sm font-semibold text-ink-900">Cartera en Mora</h2>
            </div>
            <span className="tabular text-xs font-semibold text-danger-600">
              Total: {formatCOPWhole(data.overdueAmount)}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {data.overdueCount} cuota(s) vencida(s) con mora acumulada de {formatCOPWhole(data.moraAccrued)}.
          </p>

          {data.topOverdue.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-positive-500" />
              <p className="mt-2 text-sm font-medium text-ink-800">Sin cartera vencida</p>
              <p className="text-xs text-ink-500">Todos los cobros están al día.</p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-ink-100">
              {data.topOverdue.slice(0, 5).map((o) => (
                <li key={`${o.id}-${o.code}`} className="py-3 first:pt-0">
                  <Link
                    href={`/loans/${o.id}`}
                    className="group flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900 group-hover:text-brand-600">
                        {o.clientName}
                      </p>
                      <p className="tabular text-xs text-ink-500">
                        {o.code} · {o.daysLate} día(s) de atraso
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-right">
                      <span className="tabular text-sm font-semibold text-danger-600">
                        {formatCOPWhole(o.overdueAmount)}
                      </span>
                      <ArrowUpRight
                        size={14}
                        className="text-ink-300 group-hover:text-brand-600"
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* SECCIÓN 4: PRÓXIMOS COBROS (7 A 30 DÍAS) */}
      <section className="card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 pb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="text-base font-semibold text-ink-900">
                Próximos Cobros Programados
              </h2>
              <p className="text-xs text-ink-500">
                Cuotas exigibles en el horizonte proyectado de cobro.
              </p>
            </div>
          </div>

          {/* Selector de días: 7, 15, 30 */}
          <div className="flex items-center gap-1 rounded-lg border border-ink-200 bg-ink-50 p-1 text-xs">
            <Link
              href={`/dashboard?month=${data.monthStr}&days=7`}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                upcomingDays === 7 ? "bg-white text-brand-700 shadow-xs" : "text-ink-600 hover:text-ink-900"
              }`}
            >
              Próximos 7 días
            </Link>
            <Link
              href={`/dashboard?month=${data.monthStr}&days=15`}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                upcomingDays === 15 ? "bg-white text-brand-700 shadow-xs" : "text-ink-600 hover:text-ink-900"
              }`}
            >
              15 días
            </Link>
            <Link
              href={`/dashboard?month=${data.monthStr}&days=30`}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                upcomingDays === 30 ? "bg-white text-brand-700 shadow-xs" : "text-ink-600 hover:text-ink-900"
              }`}
            >
              30 días
            </Link>
          </div>
        </div>

        {data.upcoming.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={`No hay vencimientos programados en los próximos ${upcomingDays} días`}
              description="Las cuotas vigentes tienen fechas posteriores o están todas canceladas."
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs text-ink-500">
                  <th className="pb-3 font-medium">Préstamo</th>
                  <th className="pb-3 font-medium">Cliente</th>
                  <th className="pb-3 font-medium">Cuota #</th>
                  <th className="pb-3 font-medium">Fecha Vencimiento</th>
                  <th className="pb-3 font-medium">Tiempo Restante</th>
                  <th className="pb-3 text-right font-medium">Monto Esperado</th>
                  <th className="pb-3 text-right font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.upcoming.map((u) => (
                  <tr key={`${u.id}-${u.period}-${u.dueDateIso}`} className="hover:bg-ink-50/50">
                    <td className="py-3">
                      <Link
                        href={`/loans/${u.id}`}
                        className="tabular font-semibold text-brand-600 hover:underline"
                      >
                        {u.code}
                      </Link>
                    </td>
                    <td className="py-3 font-medium text-ink-800">{u.clientName}</td>
                    <td className="tabular py-3 text-ink-600">Cuota {u.period}</td>
                    <td className="tabular py-3 text-ink-700">
                      {formatDate(u.dueDateIso)}
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.daysUntil === 0
                          ? "bg-warning-100 text-warning-800"
                          : u.daysUntil <= 3
                            ? "bg-brand-50 text-brand-700"
                            : "bg-ink-100 text-ink-600"
                      }`}>
                        {u.daysUntil === 0
                          ? "Vence hoy"
                          : u.daysUntil === 1
                            ? "Mañana"
                            : `En ${u.daysUntil} días`}
                      </span>
                    </td>
                    <td className="tabular py-3 text-right font-semibold text-ink-900">
                      {formatCOP(u.amount)}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/loans/${u.id}`}
                        className="rounded bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                      >
                        Cobrar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}