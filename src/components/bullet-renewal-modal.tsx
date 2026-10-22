"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { renewBulletLoanAction, type FormState } from "@/server/actions";
import { formatCOP, formatCOPWhole } from "@/components/format";
import { parseMoneyInput, parseIntegerInput } from "@/domain/parse";
import {
  CalendarClock,
  Clock,
  X,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 disabled:opacity-50 cursor-pointer"
    >
      {pending ? (
        <>
          <Clock size={16} className="animate-spin" /> Aplicando prórroga...
        </>
      ) : (
        <>
          <CheckCircle2 size={16} /> Confirmar y Aplicar Prórroga
        </>
      )}
    </button>
  );
}

export function BulletRenewalModal({
  loanId,
  loanCode,
  currentTermPeriods,
  monthlyRate,
  outstandingPrincipal,
  currentPendingInterest,
}: {
  loanId: string;
  loanCode: string;
  currentTermPeriods: number;
  monthlyRate: number;
  outstandingPrincipal: number;
  currentPendingInterest: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState<FormState, FormData>(
    renewBulletLoanAction,
    {},
  );

  const [newTermMonthsStr, setNewTermMonthsStr] = useState("6");
  const [extensionFeeStr, setExtensionFeeStr] = useState("");
  const [payInterest, setPayInterest] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState("TRANSFERENCIA");

  const newMonths = parseIntegerInput(newTermMonthsStr) ?? 0;
  const feeDec = parseMoneyInput(extensionFeeStr);
  const fee = feeDec ? feeDec.toNumber() : 0;
  const monthlyInterest = Math.round(outstandingPrincipal * monthlyRate);
  const totalDueToday = (payInterest ? currentPendingInterest : 0) + fee;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-100 shadow-xs cursor-pointer"
      >
        <CalendarClock size={16} className="text-brand-600" />
        Prórroga Bullet (Renovar plazo)
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="card w-full max-w-lg overflow-hidden rounded-2xl p-6 shadow-xl animate-in fade-in zoom-in-95 my-8">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-ink-100">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                  <CalendarClock size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink-900">
                    Prórroga / Renovación de Crédito Bullet
                  </h3>
                  <p className="text-xs text-ink-500">
                    Préstamo {loanCode} · Plazo actual: {currentTermPeriods} cuotas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form action={formAction} className="mt-4 space-y-4">
              <input type="hidden" name="loanId" value={loanId} />
              <input type="hidden" name="payCurrentInterest" value={payInterest ? "true" : "false"} />

              {state.error ? (
                <div className="rounded-lg bg-danger-500/10 p-3 text-xs text-danger-700 ring-1 ring-danger-500/25 ring-inset flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div>{state.error}</div>
                </div>
              ) : null}

              {state.ok ? (
                <div className="rounded-lg bg-positive-500/10 p-3 text-xs text-positive-700 ring-1 ring-positive-500/25 ring-inset flex items-start gap-2">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  <div>{state.ok}</div>
                </div>
              ) : null}

              {/* Resumen del crédito a prorrogar */}
              <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-600">Capital a aplazar:</span>
                  <span className="font-bold text-ink-900">{formatCOP(outstandingPrincipal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-600">Tasa de interés periódica:</span>
                  <span className="font-semibold text-ink-900">{(monthlyRate * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-600">Interés mensual devengado:</span>
                  <span className="font-semibold text-brand-700">{formatCOP(monthlyInterest)}</span>
                </div>
              </div>

              {/* Entradas del formulario */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label text-xs" htmlFor="newTermMonths">
                    Meses adicionales de prórroga *
                  </label>
                  <input
                    id="newTermMonths"
                    name="newTermMonths"
                    type="number"
                    min={1}
                    max={60}
                    required
                    className="field tabular font-semibold"
                    placeholder="Ej. 6 o 12"
                    value={newTermMonthsStr}
                    onChange={(e) => setNewTermMonthsStr(e.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-ink-500">
                    Nuevo plazo total: {currentTermPeriods + (newMonths > 0 ? newMonths : 0)} cuotas
                  </p>
                </div>

                <div>
                  <label className="label text-xs" htmlFor="extensionFee">
                    Comisión de prórroga ($ COP)
                  </label>
                  <input
                    id="extensionFee"
                    name="extensionFee"
                    inputMode="decimal"
                    className="field tabular"
                    placeholder="0"
                    value={extensionFeeStr}
                    onChange={(e) => setExtensionFeeStr(e.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-ink-500">
                    Comisión opcional por el trámite
                  </p>
                </div>
              </div>

              {/* Checkbox para cobrar intereses devengados */}
              <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3.5 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payInterest}
                    onChange={(e) => setPayInterest(e.target.checked)}
                    className="mt-0.5 rounded text-brand-600 focus:ring-brand-500"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-brand-900 block">
                      Recaudar cuota de interés actual ({formatCOP(currentPendingInterest)})
                    </span>
                    <span className="text-ink-600">
                      Registra el cobro de intereses del período como pagado, evitando mora sobre la cuota vencida.
                    </span>
                  </div>
                </label>
              </div>

              {totalDueToday > 0 && (
                <div>
                  <label className="label text-xs" htmlFor="paymentMethod">
                    Medio de pago del cobro inicial
                  </label>
                  <select
                    id="paymentMethod"
                    name="paymentMethod"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="field font-medium text-xs"
                  >
                    <option value="TRANSFERENCIA">Transferencia bancaria</option>
                    <option value="EFECTIVO">Efectivo en mano</option>
                    <option value="NEQUI">Nequi</option>
                    <option value="DAVIPLATA">DaviPlata</option>
                    <option value="CONSIGNACION">Consignación</option>
                    <option value="OTRO">Otro medio</option>
                  </select>
                </div>
              )}

              <div>
                <label className="label text-xs" htmlFor="notes">
                  Notas de la prórroga
                </label>
                <input
                  id="notes"
                  name="notes"
                  className="field text-xs"
                  placeholder="Ej. Solicitud de cliente, prórroga aprobada por gerencia"
                />
              </div>

              {/* Total a liquidar hoy */}
              <div className="rounded-xl bg-ink-900 p-3.5 text-white flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-ink-300 uppercase tracking-wide">
                    Recaudo total al momento de la prórroga:
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    {payInterest ? `Interés (${formatCOPWhole(currentPendingInterest)})` : "Sin interés inicial"}
                    {fee > 0 ? ` + Comisión (${formatCOPWhole(fee)})` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular text-lg font-bold text-white">
                    {formatCOP(totalDueToday)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-ink-600 hover:bg-ink-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <SubmitButton />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
