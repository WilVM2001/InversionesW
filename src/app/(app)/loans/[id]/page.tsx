import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/server/auth";
import { loadLoanView } from "@/server/loans";
import {
  formatCOP,
  formatCOPWhole,
  formatDate,
  formatRate,
  LOAN_STYLES,
  INSTALLMENT_STYLES,
  Badge,
} from "@/components/format";
import { Breakdown, PrincipalProgress, StatCard } from "@/components/ui";
import { PaymentForm } from "@/components/payment-form";
import { Sparkles } from "lucide-react";

export default async function LoanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("loans:read");
  const { id } = await params;

  const view = await loadLoanView(id);
  if (!view) notFound();

  const { loan, client, snapshots, totals, collected, outstanding } = view;
  const paidPrincipal = snapshots.reduce((a, s) => a + s.paidPrincipal, 0);
  const paidInterest = snapshots.reduce((a, s) => a + s.paidInterest, 0);
  const paidMora = snapshots.reduce((a, s) => a + s.paidMora, 0);
  const style = LOAN_STYLES[loan.status] ?? LOAN_STYLES.VIGENTE;

  const next = snapshots.find((s) => s.outstanding > 0 && s.status !== "ANULADA");
  const hasExtraPrincipal = snapshots.some((s) => s.row.extraPrincipal > 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-wide text-ink-500 uppercase">Préstamo</p>
          <h1 className="tabular mt-1 text-2xl font-semibold text-ink-900">
            {loan.code}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            <Link
              href={`/clients/${client.id}`}
              className="font-medium text-brand-600 hover:underline"
            >
              {client.firstName} {client.lastName}
            </Link>{" "}
            · Doc. {client.documentId}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={style.className}>{style.label}</Badge>
          {can(user.role, "payments:write") && loan.status !== "PAGADO" ? (
            <a
              href="#pago"
              className="rounded-lg bg-positive-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-positive-500 shadow-xs"
            >
              Registrar pago / Abono
            </a>
          ) : null}
        </div>
      </header>

      {/* Tarjetas KPI Financieras */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Capital prestado" value={Number(loan.principal)} />
        <StatCard
          label="Capital pendiente"
          value={view.summary.principalOutstanding}
          tone={view.summary.principalOutstanding > 0 ? "warning" : "positive"}
          hint={`Deuda total a pagar: ${formatCOPWhole(outstanding)}`}
        />
        <StatCard
          label="Interés pactado"
          value={totals.totalInterest}
          tone="positive"
          hint="Utilidad proyectada del crédito"
        />
        <StatCard
          label="Total recaudado"
          value={collected}
          tone="positive"
          hint={`${view.payments.length} pago(s) registrado(s)`}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Condiciones congeladas */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-ink-900">Condiciones pactadas</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Tasa</dt>
              <dd className="tabular font-medium">
                {formatRate(Number(loan.rateSnapshot))}{" "}
                {loan.frequencySnapshot.toLowerCase()}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Tipo de interés</dt>
              <dd className="font-medium">
                {loan.interestTypeSnapshot === "SIMPLE" ? "Simple" : "Compuesta"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Amortización</dt>
              <dd className="font-medium">
                {loan.methodSnapshot === "ORIGINAL_CAPITAL"
                  ? "Sobre capital original"
                  : "Sobre saldo insoluto (PMT)"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Cuotas pactadas</dt>
              <dd className="tabular font-medium">{loan.termPeriods}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Desembolso</dt>
              <dd className="tabular">{formatDate(loan.disbursementDate)}</dd>
            </div>
            {loan.firstDueDate ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Primer cobro pactado</dt>
                <dd className="tabular font-medium text-brand-700">{formatDate(loan.firstDueDate)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Mora diaria</dt>
              <dd className="tabular font-medium">
                {Number(loan.moraDailyRateSnapshot) > 0
                  ? `${Number(loan.moraDailyRateSnapshot)}% diaria`
                  : "No aplica"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Estrategia de abonos</dt>
              <dd className="font-medium text-xs">
                {loan.extraStrategySnapshot === "REDUCIR_PLAZO"
                  ? "Reducir plazo (terminar antes)"
                  : "Reducir cuota (mantiene plazo)"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-ink-200 pt-3 text-xs text-ink-500">
            Condiciones inmutables. Modificaciones a las tasas maestras no alteran este contrato.
          </p>
        </section>

        {/* Progreso de Recuperación de Capital */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-ink-900">Recuperación de capital</h2>
          <div className="mt-4">
            <PrincipalProgress paid={paidPrincipal} total={Number(loan.principal)} />
          </div>
          <h3 className="mt-6 mb-3 text-sm font-semibold text-ink-900">
            Total recaudado por concepto
          </h3>
          <Breakdown
            capital={paidPrincipal}
            interes={paidInterest}
            mora={paidMora}
          />
          <h3 className="mt-6 mb-3 text-sm font-semibold text-ink-900">
            Pendiente por cobrar
          </h3>
          <Breakdown
            capital={view.summary.principalOutstanding}
            interes={Math.max(0, view.summary.interestExpected)}
            mora={view.summary.moraAccrued}
          />
        </section>

        {/* Resumen de Estado */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-ink-900">Estado de cuotas</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Cuotas pagadas</dt>
              <dd className="tabular font-medium">
                {snapshots.filter((s) => s.status === "PAGADA").length} / {loan.termPeriods}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Cuotas vencidas</dt>
              <dd className="tabular font-semibold text-danger-600">
                {view.summary.overdueCount}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Mora activa acumulada</dt>
              <dd className="tabular font-semibold text-danger-600">
                {formatCOP(view.summary.moraAccrued)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Comprobantes emitidos</dt>
              <dd className="tabular font-medium">{view.payments.length}</dd>
            </div>
          </dl>

          {next ? (
            <div className="mt-6 rounded-lg bg-ink-100 p-3.5 border border-ink-200">
              <p className="text-xs text-ink-500">Próxima cuota exigible</p>
              <p className="tabular mt-1 text-lg font-bold text-ink-900">
                {formatCOP(next.outstanding)}
              </p>
              <p className="tabular text-xs text-ink-600 mt-0.5">
                Cuota {next.row.period} · vence {formatDate(next.row.dueDate)}
              </p>
            </div>
          ) : (
            <div className="mt-6 rounded-lg bg-positive-500/10 p-3.5 border border-positive-500/20 text-center">
              <p className="text-sm font-semibold text-positive-700">
                ¡Préstamo 100% Cancelado!
              </p>
              <p className="text-xs text-positive-600 mt-0.5">
                No hay obligaciones pendientes.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Tabla del Cronograma de Amortización */}
      <section className="card overflow-x-auto">
        <div className="border-b border-ink-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-900">
            Cronograma de amortización
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Persistido en base de datos. Se actualiza automáticamente ante abonos extraordinarios a capital.
          </p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs font-semibold text-ink-600 bg-ink-50/50">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Vencimiento</th>
              <th className="px-4 py-3 text-right">Saldo inicial</th>
              <th className="px-4 py-3 text-right">Cuota</th>
              <th className="px-4 py-3 text-right">Interés</th>
              <th className="px-4 py-3 text-right">Capital</th>
              {hasExtraPrincipal && <th className="px-4 py-3 text-right text-brand-700">Abono extra</th>}
              <th className="px-4 py-3 text-right">Mora</th>
              <th className="px-4 py-3 text-right">Saldo final</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {snapshots.map((s) => {
              const st = INSTALLMENT_STYLES[s.status] ?? INSTALLMENT_STYLES.PENDIENTE;
              const isOverdue = s.status === "VENCIDA";
              const isCancelled = s.status === "ANULADA";

              return (
                <tr
                  key={s.row.period}
                  className={
                    isOverdue
                      ? "bg-danger-500/5"
                      : isCancelled
                        ? "bg-ink-100/60 opacity-60 line-through"
                        : undefined
                  }
                >
                  <td className="tabular px-4 py-2.5 font-medium text-ink-500">{s.row.period}</td>
                  <td className="tabular px-4 py-2.5">{formatDate(s.row.dueDate)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-ink-600">
                    {formatCOPWhole(s.row.openingBalance)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right font-medium text-ink-900">
                    {formatCOP(s.row.scheduledPayment)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-ink-600">
                    {formatCOP(s.row.interest)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right text-ink-600">
                    {formatCOP(s.row.principal)}
                  </td>
                  {hasExtraPrincipal && (
                    <td className="tabular px-4 py-2.5 text-right font-semibold text-brand-700">
                      {s.row.extraPrincipal > 0 ? formatCOP(s.row.extraPrincipal) : "—"}
                    </td>
                  )}
                  <td className="tabular px-4 py-2.5 text-right text-danger-600 font-medium">
                    {s.currentMora > 0 ? formatCOP(s.currentMora) : "—"}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right font-medium text-ink-800">
                    {formatCOPWhole(s.row.closingBalance)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge className={st.className}>{st.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-300 bg-ink-50 font-semibold text-ink-900">
              <td className="px-4 py-3" colSpan={3}>
                Totales activos
              </td>
              <td className="tabular px-4 py-3 text-right">
                {formatCOPWhole(totals.totalScheduled)}
              </td>
              <td className="tabular px-4 py-3 text-right text-brand-700">
                {formatCOPWhole(totals.totalInterest)}
              </td>
              <td className="tabular px-4 py-3 text-right">
                {formatCOPWhole(totals.totalPrincipal)}
              </td>
              {hasExtraPrincipal && <td className="px-4 py-3" />}
              <td className="px-4 py-3" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Formulario de Pago */}
      {can(user.role, "payments:write") && loan.status !== "PAGADO" ? (
        <section id="pago" className="card p-6">
          <h2 className="text-sm font-semibold text-ink-900">Registrar cobro o abono a capital</h2>
          <p className="mt-1 mb-5 text-xs text-ink-500">
            Aplica a cuotas ordinarias o ingresa abonos directos que amortizan el capital restante reduciendo cuota o plazo.
          </p>
          <PaymentForm
            loanId={loan.id}
            suggested={next?.outstanding ?? outstanding}
            outstanding={outstanding}
            pendingCapital={view.summary.principalOutstanding}
            overdueAmount={view.summary.overdueAmount}
            defaultStrategy={loan.extraStrategySnapshot as "REDUCIR_CUOTA" | "REDUCIR_PLAZO"}
            pendingInstallments={snapshots
              .filter((s) => s.status !== "PAGADA" && s.status !== "ANULADA" && s.outstanding > 0)
              .map((s) => ({
                period: s.row.period,
                dueDate: s.row.dueDate,
                interestOwed: Math.max(0, s.row.interest - s.paidInterest),
                principalOwed: Math.max(0, s.row.principal - s.paidPrincipal),
                moraOwed: Math.max(0, s.currentMora + s.row.accruedMora - s.paidMora),
              }))}
          />
        </section>
      ) : null}

      {/* Historial de Comprobantes de Pago */}
      {view.payments.length > 0 ? (
        <section className="card overflow-x-auto">
          <div className="border-b border-ink-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-ink-900">Historial de pagos y abonos</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs font-semibold text-ink-600 bg-ink-50/50">
                <th className="px-4 py-3">Recibo</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Desglose aplicado</th>
                <th className="px-4 py-3 text-right">Monto recibido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {view.payments.map((p) => {
                const isExtra = p.kind === "ABONO_CAPITAL" || p.allocations.some((a) => a.type === "ABONO_EXTRA");
                return (
                  <tr key={p.id} className="hover:bg-ink-50/60">
                    <td className="tabular px-4 py-3 font-semibold text-ink-900">{p.receiptNo}</td>
                    <td className="tabular px-4 py-3 text-ink-600">{formatDate(p.paidAt)}</td>
                    <td className="px-4 py-3">
                      {isExtra ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200">
                          <Sparkles size={11} /> Abono a capital
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-700">
                          Cuota ordinaria
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-600 font-medium">{p.method}</td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {p.allocations.length > 0
                        ? p.allocations
                            .map((a) => `C${a.period} ${a.type.toLowerCase()} (${formatCOPWhole(Number(a.amount))})`)
                            .join(", ")
                        : "Sin imputar"}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold text-ink-900">
                      {formatCOP(p.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}