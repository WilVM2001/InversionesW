import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/server/auth";
import { getClientSummary } from "@/server/queries";
import { formatCOP, formatCOPWhole, formatDate, LOAN_STYLES, Badge } from "@/components/format";
import { PrincipalProgress, StatCard } from "@/components/ui";
import { DeleteClientButton } from "@/components/delete-client-button";
import { Calendar, AlertTriangle, ArrowRight } from "lucide-react";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("clients:read");
  const { id } = await params;

  const summary = await getClientSummary(id);
  if (!summary) notFound();

  const { client } = summary;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-wide text-ink-500 uppercase">
            Documento {client.documentId}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">
            {client.firstName} {client.lastName}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {[client.phone, client.email, client.occupation].filter(Boolean).join(" · ") ||
              "Sin datos de contacto"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {can(user.role, "clients:write") && (
            <DeleteClientButton
              clientId={client.id}
              clientName={`${client.firstName} ${client.lastName}`}
              documentId={client.documentId}
              loansCount={client.loans.length}
              variant="button"
            />
          )}
          <Link
            href={`/loans/new?clientId=${client.id}`}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 shadow-xs"
          >
            Nuevo préstamo
          </Link>
        </div>
      </header>

      {/* Tarjetas de Resumen Financiero Consolidado */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Capital prestado histórico"
          value={summary.totalDelivered}
          hint={`${client.loans.length} crédito(s) desembolsado(s)`}
        />
        <StatCard
          label="Capital total recuperado"
          value={summary.totalCapitalRecovered}
          tone="positive"
          hint="Retorno de principal a caja"
        />
        <StatCard
          label="Capital pendiente actual"
          value={summary.capitalPending}
          tone={summary.capitalPending > 0 ? "warning" : "positive"}
          hint="Deuda activa en circulación"
        />
        <StatCard
          label="Intereses ganados (Utilidad)"
          value={summary.interestCollected}
          tone="positive"
          hint={`Ganancia total c/mora: ${formatCOPWhole(summary.interestCollected + summary.moraCollected)}`}
        />
      </section>

      {/* Alertas de Cuotas en Mora y Próximos Vencimientos */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cuotas en Mora */}
        <section className="card p-5 border-l-4 border-l-danger-500">
          <div className="flex items-center justify-between pb-3 border-b border-ink-100">
            <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <AlertTriangle size={16} className="text-danger-600" /> Cuotas en mora
            </h2>
            <span className="tabular text-xs font-bold text-danger-600 bg-danger-50 px-2 py-0.5 rounded-full ring-1 ring-danger-200">
              {summary.overdueList.length} cuota(s) vencida(s)
            </span>
          </div>

          {summary.overdueList.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">
              El cliente se encuentra al día. No tiene cuotas vencidas.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100 text-sm">
              {summary.overdueList.map((item) => (
                <li key={`${item.loanCode}-${item.period}`} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-ink-900">{item.loanCode}</span> · Cuota {item.period}
                    <p className="text-xs text-danger-600 font-medium">
                      Venció el {formatDate(item.dueDateIso)} ({item.daysLate} días de atraso)
                    </p>
                  </div>
                  <span className="tabular font-bold text-danger-600 text-sm">
                    {formatCOP(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Próximos Vencimientos */}
        <section className="card p-5 border-l-4 border-l-brand-500">
          <div className="flex items-center justify-between pb-3 border-b border-ink-100">
            <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <Calendar size={16} className="text-brand-600" /> Próximos vencimientos
            </h2>
            <span className="text-xs text-ink-500 font-medium">
              Calendario programado
            </span>
          </div>

          {summary.upcomingList.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">
              No hay cuotas programadas pendientes para este cliente.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-100 text-sm">
              {summary.upcomingList.map((item) => (
                <li key={`${item.loanCode}-${item.period}`} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-ink-900">{item.loanCode}</span> · Cuota {item.period}
                    <p className="text-xs text-ink-500">
                      Vence el {formatDate(item.dueDateIso)} (en {item.daysUntil} día{item.daysUntil === 1 ? "" : "s"})
                    </p>
                  </div>
                  <span className="tabular font-semibold text-ink-900 text-sm">
                    {formatCOP(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Historial de Préstamos del Cliente */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold text-ink-900">Historial de créditos</h2>
        {client.loans.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">Este cliente no tiene préstamos registrados.</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-200">
            {client.loans.map((loan) => {
              const paidP = loan.installments.reduce((a, i) => a + Number(i.paidPrincipal), 0);
              const paidI = loan.installments.reduce((a, i) => a + Number(i.paidInterest), 0);
              const pendingP = loan.installments.reduce(
                (a, i) => a + Math.max(0, Number(i.principal) - Number(i.paidPrincipal)),
                0,
              );
              const style = LOAN_STYLES[loan.status] ?? LOAN_STYLES.VIGENTE;

              return (
                <li key={loan.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link
                        href={`/loans/${loan.id}`}
                        className="tabular text-sm font-semibold text-brand-600 hover:underline flex items-center gap-1.5"
                      >
                        {loan.code} <ArrowRight size={14} />
                      </Link>
                      <p className="tabular mt-0.5 text-xs text-ink-500">
                        Capital: {formatCOP(loan.principal)} · {loan.termPeriods} cuotas ·
                        Desembolso: {formatDate(loan.disbursementDate)}
                        {loan.firstDueDate ? ` · 1er cobro: ${formatDate(loan.firstDueDate)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="text-right">
                        <p className="text-[11px] text-brand-700 font-medium">Recuperado</p>
                        <p className="tabular text-xs font-bold text-brand-700">{formatCOP(paidP)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-positive-700 font-medium">Interés ganado</p>
                        <p className="tabular text-xs font-bold text-positive-700">{formatCOP(paidI)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-ink-500 font-medium">Pendiente</p>
                        <p className="tabular text-xs font-semibold text-ink-900">{formatCOP(pendingP)}</p>
                      </div>
                      <Badge className={style.className}>{style.label}</Badge>
                    </div>
                  </div>
                  <div className="mt-3">
                    <PrincipalProgress paid={paidP} total={Number(loan.principal)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Datos Adicionales */}
      {client.address || client.notes ? (
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-ink-900">Información interna</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {client.address ? (
              <div>
                <dt className="text-ink-500 font-medium">Dirección</dt>
                <dd className="text-ink-800">{client.address}</dd>
              </div>
            ) : null}
            {client.notes ? (
              <div>
                <dt className="text-ink-500 font-medium">Notas privadas</dt>
                <dd className="text-ink-800">{client.notes}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
    </div>
  );
}