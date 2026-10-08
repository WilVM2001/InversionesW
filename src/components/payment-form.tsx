"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { registerPaymentAction, type FormState } from "@/server/actions";
import { formatCOP } from "@/components/format";
import { parseMoneyInput } from "@/domain/parse";
import { todayIso } from "@/domain/dates";
import { previewAllocationBreakdown, type PendingInstallmentSummary } from "@/domain/payments";
import { Coins, Sparkles, AlertCircle, TrendingUp } from "lucide-react";

const METHODS = ["EFECTIVO", "TRANSFERENCIA", "NEQUI", "DAVINCI", "PSE", "OTRO"];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-positive-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-positive-500 disabled:opacity-60"
    >
      {pending ? "Registrando pago..." : "Confirmar y registrar pago"}
    </button>
  );
}

export function PaymentForm({
  loanId,
  suggested,
  outstanding,
  pendingCapital = 0,
  overdueAmount = 0,
  defaultStrategy = "REDUCIR_CUOTA",
  pendingInstallments = [],
}: {
  loanId: string;
  suggested: number;
  outstanding: number;
  pendingCapital?: number;
  overdueAmount?: number;
  defaultStrategy?: "REDUCIR_CUOTA" | "REDUCIR_PLAZO";
  pendingInstallments?: PendingInstallmentSummary[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    registerPaymentAction,
    {},
  );

  const [kind, setKind] = useState<"CUOTA" | "ABONO_CAPITAL">("CUOTA");
  const [surplusMode, setSurplusMode] = useState<"ABONO_CAPITAL" | "ADELANTAR_CUOTAS">("ABONO_CAPITAL");
  const [extraStrategy, setExtraStrategy] = useState<"REDUCIR_CUOTA" | "REDUCIR_PLAZO">(defaultStrategy);
  const [amountStr, setAmountStr] = useState(suggested > 0 ? String(suggested) : "");

  const numericAmount = useMemo(() => {
    const val = parseMoneyInput(amountStr);
    return val ? val.toNumber() : 0;
  }, [amountStr]);

  const breakdown = useMemo(() => {
    return previewAllocationBreakdown({
      amount: numericAmount,
      kind,
      surplusMode,
      installments: pendingInstallments,
      totalPendingCapital: pendingCapital,
    });
  }, [numericAmount, kind, surplusMode, pendingInstallments, pendingCapital]);

  const exceedsOutstanding = numericAmount > outstanding + 0.01;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="loanId" value={loanId} />

      {state.error ? (
        <div className="rounded-lg bg-danger-500/10 p-3.5 text-sm text-danger-600 ring-1 ring-danger-500/25 ring-inset flex items-start gap-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      ) : null}

      {state.ok ? (
        <div className="rounded-lg bg-positive-500/10 p-3.5 text-sm text-positive-700 ring-1 ring-positive-500/25 ring-inset flex items-start gap-2">
          <Sparkles size={18} className="shrink-0 mt-0.5" />
          <span>{state.ok}</span>
        </div>
      ) : null}

      {/* Selector de Tipo de Pago */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-ink-100 p-1.5 border border-ink-200">
        <button
          type="button"
          onClick={() => {
            setKind("CUOTA");
            if (suggested > 0) setAmountStr(String(suggested));
          }}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
            kind === "CUOTA"
              ? "bg-white text-ink-900 shadow-xs"
              : "text-ink-600 hover:text-ink-900"
          }`}
        >
          <Coins size={15} /> Pago ordinario de cuota
        </button>

        <button
          type="button"
          onClick={() => {
            setKind("ABONO_CAPITAL");
            setAmountStr("");
          }}
          className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
            kind === "ABONO_CAPITAL"
              ? "bg-white text-brand-700 shadow-xs"
              : "text-ink-600 hover:text-ink-900"
          }`}
        >
          <Sparkles size={15} /> Abono directo a capital
        </button>
      </div>

      <input type="hidden" name="kind" value={kind} />

      {/* Advertencia si hay mora y se selecciona abono a capital */}
      {kind === "ABONO_CAPITAL" && overdueAmount > 0 ? (
        <div className="rounded-lg bg-warning-500/10 p-3 text-xs text-warning-700 ring-1 ring-warning-500/25 ring-inset flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0 text-warning-600" />
          <span>
            Este cliente tiene <strong>{formatCOP(overdueAmount)}</strong> en cuotas vencidas. El abono se aplicará directo al capital reduciendo intereses futuros, pero las cuotas vencidas seguirán generando mora hasta ser canceladas.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Campo Monto y Accesos rápidos */}
        <div>
          <label className="label" htmlFor="amount">
            Monto a pagar ($ COP) *
          </label>
          <input
            id="amount"
            name="amount"
            required
            inputMode="decimal"
            className="field tabular text-base font-semibold"
            placeholder="Ej. 450.000"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />

          {/* Accesos rápidos de monto */}
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
            {kind === "CUOTA" ? (
              <>
                {suggested > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmountStr(String(suggested))}
                    className="rounded bg-ink-100 px-2 py-1 text-ink-700 hover:bg-ink-200"
                  >
                    Cuota actual ({formatCOP(suggested)})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAmountStr(String(outstanding))}
                  className="rounded bg-brand-50 px-2 py-1 text-brand-700 hover:bg-brand-100"
                >
                  Saldar deuda ({formatCOP(outstanding)})
                </button>
              </>
            ) : (
              <>
                {pendingCapital > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmountStr(String(pendingCapital))}
                    className="rounded bg-brand-50 px-2 py-1 text-brand-700 hover:bg-brand-100"
                  >
                    Liquidar todo el capital ({formatCOP(pendingCapital)})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAmountStr("500000")}
                  className="rounded bg-ink-100 px-2 py-1 text-ink-700 hover:bg-ink-200"
                >
                  $500.000
                </button>
                <button
                  type="button"
                  onClick={() => setAmountStr("1000000")}
                  className="rounded bg-ink-100 px-2 py-1 text-ink-700 hover:bg-ink-200"
                >
                  $1.000.000
                </button>
              </>
            )}
          </div>

          {exceedsOutstanding ? (
            <p className="mt-1 text-xs text-warning-600 font-medium">
              El monto supera la deuda total pendiente ({formatCOP(outstanding)}).
            </p>
          ) : null}
        </div>

        {/* Fecha del pago */}
        <div>
          <label className="label" htmlFor="paidAt">
            Fecha exacta del pago *
          </label>
          <input
            id="paidAt"
            name="paidAt"
            type="date"
            required
            defaultValue={todayIso()}
            className="field font-medium"
          />
          <p className="mt-1 text-xs text-ink-500">
            La mora se evalúa exactamente a esta fecha de pago.
          </p>
        </div>

        {/* Método de pago */}
        <div>
          <label className="label" htmlFor="method">
            Canal o método de pago *
          </label>
          <select id="method" name="method" required className="field font-medium" defaultValue="EFECTIVO">
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Referencia */}
        <div>
          <label className="label" htmlFor="reference">
            Nº de comprobante o referencia
          </label>
          <input
            id="reference"
            name="reference"
            className="field"
            placeholder="Ej. Nro transferencia, recibo manual..."
          />
        </div>
      </div>

      {/* Panel de Desglose en Tiempo Real: Interés vs Capital */}
      {numericAmount > 0 ? (
        <div className="rounded-xl border border-ink-200 bg-gradient-to-b from-white to-ink-50/50 p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-positive-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-ink-800">
                Desglose financiero en tiempo real
              </span>
            </div>
            <span className="tabular text-xs font-semibold text-ink-900 bg-ink-100 px-2.5 py-1 rounded-md">
              Total a registrar: {formatCOP(numericAmount)}
            </span>
          </div>

          {/* Tarjetas de Desglose */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* A Interés (Ganancia) */}
            <div className="rounded-lg border border-positive-200 bg-positive-50/70 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-positive-800">A Interés</span>
                {breakdown.totalInterestPercent > 0 && (
                  <span className="tabular text-[10px] font-bold px-1.5 py-0.5 rounded bg-positive-200/80 text-positive-900">
                    {breakdown.totalInterestPercent}%
                  </span>
                )}
              </div>
              <p className="tabular mt-1 text-base font-bold text-positive-700">
                {formatCOP(breakdown.toInterest)}
              </p>
              <p className="text-[11px] text-positive-600 font-medium mt-0.5">
                Tu Ganancia Real
              </p>
            </div>

            {/* A Capital (Recuperación) */}
            <div className="rounded-lg border border-brand-200 bg-brand-50/70 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand-800">A Capital</span>
                {breakdown.totalPrincipalPercent > 0 && (
                  <span className="tabular text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-200/80 text-brand-900">
                    {breakdown.totalPrincipalPercent}%
                  </span>
                )}
              </div>
              <p className="tabular mt-1 text-base font-bold text-brand-700">
                {formatCOP(breakdown.toPrincipal)}
              </p>
              <p className="text-[11px] text-brand-600 font-medium mt-0.5">
                Retorno de Principal
              </p>
            </div>

            {/* Abono Extra (si aplica) */}
            {breakdown.toExtraCapital > 0 ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
                <span className="text-xs font-semibold text-indigo-800 flex items-center gap-1">
                  <Sparkles size={12} /> Abono Extra
                </span>
                <p className="tabular mt-1 text-base font-bold text-indigo-700">
                  {formatCOP(breakdown.toExtraCapital)}
                </p>
                <p className="text-[11px] text-indigo-600 font-medium mt-0.5">
                  Reduce capital futuro
                </p>
              </div>
            ) : null}

            {/* Mora (si aplica) */}
            {breakdown.toMora > 0 ? (
              <div className="rounded-lg border border-danger-200 bg-danger-50/70 p-3">
                <span className="text-xs font-semibold text-danger-800">A Mora</span>
                <p className="tabular mt-1 text-base font-bold text-danger-700">
                  {formatCOP(breakdown.toMora)}
                </p>
                <p className="text-[11px] text-danger-600 font-medium mt-0.5">
                  Recargo por retraso
                </p>
              </div>
            ) : null}

            {/* Excedente no absorbido (si sobrepasa la deuda) */}
            {breakdown.unapplied > 0 ? (
              <div className="rounded-lg border border-warning-200 bg-warning-50/70 p-3">
                <span className="text-xs font-semibold text-warning-800">Sobrante</span>
                <p className="tabular mt-1 text-base font-bold text-warning-700">
                  {formatCOP(breakdown.unapplied)}
                </p>
                <p className="text-[11px] text-warning-600 font-medium mt-0.5">
                  Supera deuda total
                </p>
              </div>
            ) : null}
          </div>

          {/* Barra visual de distribución */}
          {breakdown.totalApplied > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-200 flex">
                {breakdown.toMora > 0 && (
                  <div
                    style={{ width: `${(breakdown.toMora / breakdown.totalApplied) * 100}%` }}
                    className="bg-danger-500 transition-all"
                    title={`Mora: ${formatCOP(breakdown.toMora)}`}
                  />
                )}
                {breakdown.toInterest > 0 && (
                  <div
                    style={{ width: `${(breakdown.toInterest / breakdown.totalApplied) * 100}%` }}
                    className="bg-positive-500 transition-all"
                    title={`Interés: ${formatCOP(breakdown.toInterest)}`}
                  />
                )}
                {breakdown.toPrincipal > 0 && (
                  <div
                    style={{ width: `${(breakdown.toPrincipal / breakdown.totalApplied) * 100}%` }}
                    className="bg-brand-500 transition-all"
                    title={`Capital: ${formatCOP(breakdown.toPrincipal)}`}
                  />
                )}
                {breakdown.toExtraCapital > 0 && (
                  <div
                    style={{ width: `${(breakdown.toExtraCapital / breakdown.totalApplied) * 100}%` }}
                    className="bg-indigo-500 transition-all"
                    title={`Abono Extra: ${formatCOP(breakdown.toExtraCapital)}`}
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between text-[11px] text-ink-600 pt-0.5">
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="inline-block h-2 w-2 rounded-full bg-positive-500" /> Ganancia (Interés): {formatCOP(breakdown.toInterest)}
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="inline-block h-2 w-2 rounded-full bg-brand-500" /> Capital (Recuperación): {formatCOP(breakdown.toPrincipal + breakdown.toExtraCapital)}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Reglas de Abono / Excedente */}
      {kind === "CUOTA" ? (
        <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <label className="text-xs font-semibold text-ink-900 block" htmlFor="surplusMode">
                Si el monto supera las cuotas exigibles (sobrante):
              </label>
              <p className="text-xs text-ink-500">
                Determina qué hacer con el dinero extra tras pagar la cuota actual.
              </p>
            </div>
            <select
              id="surplusMode"
              name="surplusMode"
              className="field sm:w-64 text-xs font-medium"
              value={surplusMode}
              onChange={(e) => setSurplusMode(e.target.value as "ABONO_CAPITAL" | "ADELANTAR_CUOTAS")}
            >
              <option value="ABONO_CAPITAL">Abonar a capital (Ahorra interés)</option>
              <option value="ADELANTAR_CUOTAS">Adelantar cuotas siguientes</option>
            </select>
          </div>

          {surplusMode === "ABONO_CAPITAL" ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-ink-200">
              <span className="text-xs text-ink-700 font-medium">
                Efecto del abono sobre las cuotas restantes:
              </span>
              <select
                id="extraStrategy"
                name="extraStrategy"
                className="field sm:w-64 text-xs"
                value={extraStrategy}
                onChange={(e) => setExtraStrategy(e.target.value as "REDUCIR_CUOTA" | "REDUCIR_PLAZO")}
              >
                <option value="REDUCIR_CUOTA">Reducir cuota (mantiene el plazo)</option>
                <option value="REDUCIR_PLAZO">Reducir plazo (terminar antes)</option>
              </select>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <label className="text-xs font-semibold text-brand-900 block" htmlFor="extraStrategyDirect">
              Efecto del abono a capital:
            </label>
            <p className="text-xs text-ink-500">
              Elige cómo recalcular el cronograma futuro tras reducir el capital insoluto.
            </p>
          </div>
          <select
            id="extraStrategyDirect"
            name="extraStrategy"
            className="field sm:w-64 text-xs font-medium"
            value={extraStrategy}
            onChange={(e) => setExtraStrategy(e.target.value as "REDUCIR_CUOTA" | "REDUCIR_PLAZO")}
          >
            <option value="REDUCIR_CUOTA">Reducir cuota (mantiene el plazo)</option>
            <option value="REDUCIR_PLAZO">Reducir plazo (terminar antes)</option>
          </select>
        </div>
      )}

      {/* Notas */}
      <div>
        <label className="label" htmlFor="notes">
          Observaciones del recibo
        </label>
        <input
          id="notes"
          name="notes"
          className="field"
          placeholder="Opcional: detalles del abono o receptor..."
        />
      </div>

      <div className="pt-2">
        <Submit />
      </div>
    </form>
  );
}