"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  Calculator,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  ArrowLeft,
  X,
  Loader2,
  DollarSign,
  Info,
} from "lucide-react";
import { updateLoanAction, deleteLoanAction, type FormState } from "@/server/actions";
import { generateSchedule, scheduleTotals, solvePrincipalFromPayment } from "@/domain/amortization";
import { addPeriods, toDate, toIso } from "@/domain/dates";
import { parseMoneyInput, parsePercentInput, parseIntegerInput } from "@/domain/parse";
import { percentToFraction } from "@/domain/money";
import { formatCOP, formatCOPWhole, formatDate } from "@/components/format";
import type {
  AmortizationMethod,
  ExtraPaymentStrategy,
  Frequency,
  InterestType,
  LoanTerms,
} from "@/domain/types";

interface ClientOption {
  id: string;
  name: string;
  documentId: string;
}

interface RateOption {
  id: string;
  name: string;
  rate: number;
  frequency: string;
  amortizationMethod: string;
  interestType: string;
  moraDailyRatePercent: number;
  moraGraceDays: number | null;
  extraPaymentStrategy?: string | null;
}

export interface InitialLoanData {
  id: string;
  code: string;
  clientId: string;
  principal: number;
  ratePercent: number;
  frequency: Frequency;
  amortizationMethod: AmortizationMethod;
  interestType: InterestType;
  termPeriods: number;
  disbursementDate: string;
  firstDueDate: string;
  moraDailyRatePercent: number;
  moraGraceDays: number;
  extraPaymentStrategy: ExtraPaymentStrategy;
  status: "VIGENTE" | "PAGADO" | "REESTRUCTURADO" | "CASTIGADO";
  notes: string;
  paymentsCount: number;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
    >
      {pending ? (
        <>
          <Clock className="animate-spin h-4 w-4" />
          Actualizando préstamo y re-imputando...
        </>
      ) : (
        <>
          <CheckCircle2 className="h-4 w-4" />
          Guardar Cambios del Préstamo
        </>
      )}
    </button>
  );
}

function DeleteSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-danger-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-danger-700 disabled:opacity-50 cursor-pointer"
    >
      {pending ? (
        <>
          <Loader2 size={14} className="animate-spin" /> Eliminando...
        </>
      ) : (
        "Sí, eliminar préstamo definitivamente"
      )}
    </button>
  );
}

export function EditLoanForm({
  loan,
  clients,
  rates,
}: {
  loan: InitialLoanData;
  clients: ClientOption[];
  rates: RateOption[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(updateLoanAction, {});
  const [deleteState, deleteAction] = useActionState<FormState, FormData>(deleteLoanAction, {});
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Estados del formulario inicializados con los datos actuales del crédito
  const [clientId, setClientId] = useState(loan.clientId);
  const [status, setStatus] = useState<"VIGENTE" | "PAGADO" | "REESTRUCTURADO" | "CASTIGADO">(
    loan.status,
  );
  const [principalStr, setPrincipalStr] = useState(formatCOPWhole(loan.principal));
  const [ratePercentStr, setRatePercentStr] = useState(String(loan.ratePercent));
  const [frequency, setFrequency] = useState<Frequency>(loan.frequency);
  const [termPeriodsStr, setTermPeriodsStr] = useState(String(loan.termPeriods));
  const [disbursementDate, setDisbursementDate] = useState(loan.disbursementDate);
  const [firstDueDate, setFirstDueDate] = useState(loan.firstDueDate);

  const [amortizationMethod, setAmortizationMethod] = useState<AmortizationMethod>(
    loan.amortizationMethod,
  );
  const [interestType, setInterestType] = useState<InterestType>(loan.interestType);
  const [flatRateScope, setFlatRateScope] = useState<"TOTAL" | "PERIODIC">("TOTAL");

  const [moraDailyRateStr, setMoraDailyRateStr] = useState(String(loan.moraDailyRatePercent));
  const [moraGraceDaysStr, setMoraGraceDaysStr] = useState(String(loan.moraGraceDays));
  const [extraPaymentStrategy, setExtraPaymentStrategy] = useState<ExtraPaymentStrategy>(
    loan.extraPaymentStrategy,
  );
  const [notes, setNotes] = useState(loan.notes);

  const [showFullSchedule, setShowFullSchedule] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Plantilla de tasa opcional
  const handleRateTemplateChange = (rateId: string) => {
    const selected = rates.find((r) => r.id === rateId);
    if (!selected) return;
    setRatePercentStr(String(Number(selected.rate) * 100));
    setFrequency(selected.frequency as Frequency);
    setAmortizationMethod(selected.amortizationMethod as AmortizationMethod);
    setInterestType(selected.interestType as InterestType);
    setMoraDailyRateStr(String(selected.moraDailyRatePercent));
    if (selected.moraGraceDays != null) setMoraGraceDaysStr(String(selected.moraGraceDays));
    if (selected.extraPaymentStrategy) {
      setExtraPaymentStrategy(selected.extraPaymentStrategy as ExtraPaymentStrategy);
    }
  };

  // Simulación en vivo de las nuevas condiciones
  const simulation = useMemo(() => {
    const ratePercentDec = parsePercentInput(ratePercentStr);
    const periods = parseIntegerInput(termPeriodsStr);
    const moraRateDec = parsePercentInput(moraDailyRateStr);
    const graceDays = parseIntegerInput(moraGraceDaysStr) ?? 0;
    const principalDec = parseMoneyInput(principalStr);

    if (!ratePercentDec || ratePercentDec.lt(0) || !periods || periods <= 0 || !principalDec || principalDec.lte(0)) {
      return null;
    }

    let effectiveRatePercent = ratePercentDec.toNumber();
    if (amortizationMethod === "ORIGINAL_CAPITAL" && flatRateScope === "PERIODIC") {
      effectiveRatePercent = ratePercentDec.times(periods).toNumber();
    }
    const rateFraction = percentToFraction(effectiveRatePercent).toNumber();
    const principal = principalDec.toNumber();

    try {
      const terms: LoanTerms = {
        principal,
        rate: rateFraction,
        frequency,
        interestType,
        amortizationMethod,
        termPeriods: periods,
        disbursementDate,
        firstDueDate: firstDueDate || null,
        mora: {
          dailyRatePercent: moraRateDec ? moraRateDec.toNumber() : 0,
          graceDays,
          capPercentOfBalance: null,
          onTotalBalance: false,
        },
      };

      const rows = generateSchedule(terms);
      const totals = scheduleTotals(rows);

      return {
        terms,
        rows,
        totals,
        principal,
        cuotaRegular: rows[0]?.scheduledPayment ?? 0,
        cuotaFinal: rows[rows.length - 1]?.scheduledPayment ?? 0,
        isBullet: amortizationMethod === "BULLET" || amortizationMethod === "INTEREST_ONLY",
        totalScheduled: totals.totalScheduled,
        totalInterest: totals.totalInterest,
        nextDueDate: rows[0]?.dueDate ?? firstDueDate,
        lastDueDate: rows[rows.length - 1]?.dueDate ?? "",
        effectiveRatePercent,
      };
    } catch {
      return null;
    }
  }, [
    principalStr,
    ratePercentStr,
    termPeriodsStr,
    moraDailyRateStr,
    moraGraceDaysStr,
    amortizationMethod,
    flatRateScope,
    frequency,
    interestType,
    disbursementDate,
    firstDueDate,
  ]);

  return (
    <div className="space-y-6">
      {/* Botón de regreso */}
      <div className="flex items-center justify-between">
        <Link
          href={`/loans/${loan.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900 transition"
        >
          <ArrowLeft size={16} /> Volver al detalle de {loan.code}
        </Link>
        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-danger-200 bg-danger-50 px-3 py-1.5 text-xs font-semibold text-danger-700 transition hover:bg-danger-100 cursor-pointer"
        >
          <Trash2 size={13} /> Eliminar préstamo
        </button>
      </div>

      {/* Alerta de pagos existentes */}
      {loan.paymentsCount > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-sm text-amber-900">
              Préstamo con {loan.paymentsCount} pago(s) registrado(s)
            </p>
            <p>
              Puedes modificar el capital, tasa, periodicidad, método o plazo. Al guardar, el cronograma se regenerará con las nuevas condiciones y los pagos ya efectuados se re-imputarán automáticamente a las nuevas cuotas en orden cronológico.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 text-brand-900 flex items-start gap-3">
          <Info className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-semibold text-brand-900">Edición completa habilitada</p>
            <p className="text-brand-700">
              Este préstamo no tiene pagos registrados aún. Cualquier modificación recalculará y regenerará el cronograma de amortización al 100%.
            </p>
          </div>
        </div>
      )}

      {/* Formulario Principal */}
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="loanId" value={loan.id} />

        {/* 1. INFORMACIÓN GENERAL Y ESTADO */}
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-ink-100 pb-3">
            <h2 className="text-base font-semibold text-ink-900">
              Datos Generales · {loan.code}
            </h2>
            <span className="text-xs text-ink-500 font-mono">ID: {loan.id}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="clientId">
                Cliente asignado *
              </label>
              <select
                id="clientId"
                name="clientId"
                required
                className="field"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.documentId}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor="status">
                Estado del crédito *
              </label>
              <select
                id="status"
                name="status"
                required
                className="field font-semibold"
                value={status}
                onChange={(e) =>
                  setStatus(
                    e.target.value as "VIGENTE" | "PAGADO" | "REESTRUCTURADO" | "CASTIGADO",
                  )
                }
              >
                <option value="VIGENTE">VIGENTE (En cobranza normal)</option>
                <option value="PAGADO">PAGADO (Completamente cancelado)</option>
                <option value="REESTRUCTURADO">REESTRUCTURADO (Condiciones refinanciadas)</option>
                <option value="CASTIGADO">CASTIGADO (Cartera incobrable)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 2. CONDICIONES FINANCIERAS */}
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-ink-900">
            Condiciones del Crédito
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="principal">
                Capital Prestado (COP) *
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400 font-semibold">
                  $
                </span>
                <input
                  id="principal"
                  name="principal"
                  type="text"
                  required
                  className="field pl-8 font-semibold text-ink-900"
                  value={principalStr}
                  onChange={(e) => setPrincipalStr(e.target.value)}
                  placeholder="5.000.000"
                />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="rateTemplate">
                Cargar plantilla de tasa (Opcional)
              </label>
              <select
                id="rateTemplate"
                name="rateProfileId"
                className="field"
                defaultValue=""
                onChange={(e) => handleRateTemplateChange(e.target.value)}
              >
                <option value="">Mantener configuración manual</option>
                {rates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({(r.rate * 100).toFixed(2)}% {r.frequency.toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selector de Método de Amortización */}
          <div className="space-y-2 pt-2">
            <label className="text-xs font-semibold text-ink-700 uppercase tracking-wider block">
              Método de amortización *
            </label>
            <input type="hidden" name="amortizationMethod" value={amortizationMethod} />
            <input type="hidden" name="interestType" value={interestType} />

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Opción 1: Tasa Fija */}
              <button
                type="button"
                onClick={() => {
                  setAmortizationMethod("ORIGINAL_CAPITAL");
                  setInterestType("SIMPLE");
                }}
                className={`rounded-xl border p-3.5 text-left transition relative cursor-pointer ${
                  amortizationMethod === "ORIGINAL_CAPITAL"
                    ? "border-brand-600 bg-brand-50/50 ring-2 ring-brand-500"
                    : "border-ink-200 bg-white hover:bg-ink-50/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink-900 text-xs">
                    Tasa Fija Directa
                  </span>
                  {amortizationMethod === "ORIGINAL_CAPITAL" && (
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase">
                      Activo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-ink-600 leading-snug">
                  Interés simple sobre capital original. Cuotas iguales.
                </p>
              </button>

              {/* Opción 2: Saldo Insoluto */}
              <button
                type="button"
                onClick={() => {
                  setAmortizationMethod("OUTSTANDING_BALANCE");
                  setInterestType("COMPUESTA");
                }}
                className={`rounded-xl border p-3.5 text-left transition relative cursor-pointer ${
                  amortizationMethod === "OUTSTANDING_BALANCE"
                    ? "border-brand-600 bg-brand-50/50 ring-2 ring-brand-500"
                    : "border-ink-200 bg-white hover:bg-ink-50/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink-900 text-xs">
                    Saldo Insoluto (Francés)
                  </span>
                  {amortizationMethod === "OUTSTANDING_BALANCE" && (
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase">
                      Activo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-ink-600 leading-snug">
                  Interés decreciente sobre saldo remanente (PMT).
                </p>
              </button>

              {/* Opción 3: Bullet / Interés Puro */}
              <button
                type="button"
                onClick={() => {
                  setAmortizationMethod("BULLET");
                  setInterestType("SIMPLE");
                }}
                className={`rounded-xl border p-3.5 text-left transition relative cursor-pointer ${
                  amortizationMethod === "BULLET" || amortizationMethod === "INTEREST_ONLY"
                    ? "border-brand-600 bg-brand-50/50 ring-2 ring-brand-500"
                    : "border-ink-200 bg-white hover:bg-ink-50/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink-900 text-xs">
                    Interés Puro (Bullet)
                  </span>
                  {(amortizationMethod === "BULLET" ||
                    amortizationMethod === "INTEREST_ONLY") && (
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[9px] font-bold text-white uppercase">
                      Activo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-ink-600 leading-snug">
                  Cuota 100% ganancia. Capital intacto hasta el final.
                </p>
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 pt-2">
            <div>
              <label className="label" htmlFor="ratePercent">
                Tasa de interés (%) *
              </label>
              <div className="relative">
                <input
                  id="ratePercent"
                  name="ratePercent"
                  type="text"
                  required
                  className="field pr-8 font-semibold"
                  value={ratePercentStr}
                  onChange={(e) => setRatePercentStr(e.target.value)}
                  placeholder="2"
                />
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 font-semibold">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="frequency">
                Periodicidad *
              </label>
              <select
                id="frequency"
                name="frequency"
                required
                className="field font-medium"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
              >
                <option value="DIARIA">Diaria</option>
                <option value="SEMANAL">Semanal</option>
                <option value="QUINCENAL">Quincenal</option>
                <option value="MENSUAL">Mensual</option>
                <option value="BIMESTRAL">Bimestral</option>
                <option value="TRIMESTRAL">Trimestral</option>
                <option value="SEMESTRAL">Semestral</option>
                <option value="ANUAL">Anual</option>
              </select>
            </div>

            <div>
              <label className="label" htmlFor="termPeriods">
                Plazo (Número de cuotas) *
              </label>
              <input
                id="termPeriods"
                name="termPeriods"
                type="number"
                min="1"
                required
                className="field font-semibold"
                value={termPeriodsStr}
                onChange={(e) => setTermPeriodsStr(e.target.value)}
                placeholder="12"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 pt-2">
            <div>
              <label className="label" htmlFor="disbursementDate">
                Fecha de desembolso *
              </label>
              <input
                id="disbursementDate"
                name="disbursementDate"
                type="date"
                required
                className="field"
                value={disbursementDate}
                onChange={(e) => setDisbursementDate(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="firstDueDate">
                Fecha de primer cobro
              </label>
              <input
                id="firstDueDate"
                name="firstDueDate"
                type="date"
                className="field"
                value={firstDueDate}
                onChange={(e) => setFirstDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* 3. SIMULADOR EN VIVO */}
        {simulation ? (
          <div className="rounded-xl border border-brand-300 bg-brand-50/40 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-brand-200 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-900 flex items-center gap-1.5">
                <Calculator size={15} className="text-brand-600" />
                Proyección del Crédito Actualizado
              </span>
              <button
                type="button"
                onClick={() => setShowFullSchedule(!showFullSchedule)}
                className="text-xs font-semibold text-brand-700 hover:text-brand-900 hover:underline cursor-pointer"
              >
                {showFullSchedule ? "Ocultar tabla de cuotas" : "Ver tabla de cuotas completa"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-[11px] text-ink-500">
                  {simulation.isBullet ? "Cuota periódica (Interés)" : "Valor por cuota"}
                </p>
                <p className="tabular mt-1 text-lg font-bold text-ink-900">
                  {formatCOP(simulation.cuotaRegular)}
                </p>
              </div>

              {simulation.isBullet && (
                <div>
                  <p className="text-[11px] text-ink-500">Cuota final (Mes {simulation.rows.length})</p>
                  <p className="tabular mt-1 text-lg font-bold text-brand-700">
                    {formatCOP(simulation.cuotaFinal)}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[11px] text-ink-500">Total intereses pactados</p>
                <p className="tabular mt-1 text-lg font-bold text-positive-700">
                  {formatCOP(simulation.totalInterest)}
                </p>
              </div>

              <div>
                <p className="text-[11px] text-ink-500">Total a pagar proyectado</p>
                <p className="tabular mt-1 text-lg font-bold text-ink-900">
                  {formatCOP(simulation.totalScheduled)}
                </p>
              </div>
            </div>

            {showFullSchedule && (
              <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-brand-200 bg-white shadow-inner">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-brand-100 text-brand-900 border-b border-brand-200">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Vence</th>
                      <th className="px-3 py-2 text-right">Capital</th>
                      <th className="px-3 py-2 text-right">Interés</th>
                      <th className="px-3 py-2 text-right font-bold">Cuota Total</th>
                      <th className="px-3 py-2 text-right">Saldo Restante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {simulation.rows.map((r) => (
                      <tr key={r.period} className="hover:bg-brand-50/50">
                        <td className="px-3 py-1.5 font-medium text-ink-700">{r.period}</td>
                        <td className="px-3 py-1.5 text-ink-600">{formatDate(r.dueDate)}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-ink-700">
                          {formatCOP(r.principal)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-positive-700">
                          {formatCOP(r.interest)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold text-ink-900">
                          {formatCOP(r.scheduledPayment)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-ink-500">
                          {formatCOP(r.closingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {/* 4. CONFIGURACIÓN AVANZADA Y NOTAS */}
        <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-xs space-y-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center justify-between text-left font-semibold text-ink-900 text-sm cursor-pointer"
          >
            <span>Configuración avanzada (Mora, Abonos y Notas)</span>
            <span className="text-xs text-brand-600 font-medium">
              {showAdvanced ? "Ocultar" : "Mostrar"}
            </span>
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-3 border-t border-ink-100">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="moraDailyRatePercent">
                    Tasa mora diaria (%)
                  </label>
                  <input
                    id="moraDailyRatePercent"
                    name="moraDailyRatePercent"
                    type="text"
                    className="field"
                    value={moraDailyRateStr}
                    onChange={(e) => setMoraDailyRateStr(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="moraGraceDays">
                    Días de gracia
                  </label>
                  <input
                    id="moraGraceDays"
                    name="moraGraceDays"
                    type="number"
                    min="0"
                    className="field"
                    value={moraGraceDaysStr}
                    onChange={(e) => setMoraGraceDaysStr(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="extraPaymentStrategy">
                    Estrategia de abonos
                  </label>
                  <select
                    id="extraPaymentStrategy"
                    name="extraPaymentStrategy"
                    className="field"
                    value={extraPaymentStrategy}
                    onChange={(e) =>
                      setExtraPaymentStrategy(e.target.value as ExtraPaymentStrategy)
                    }
                  >
                    <option value="REDUCIR_CUOTA">Reducir cuota (mantiene plazo)</option>
                    <option value="REDUCIR_PLAZO">Reducir plazo (terminar antes)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="notes">
                  Notas u Observaciones del Préstamo
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  className="field text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalles del acuerdo, referencias o anotaciones internas..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Mensaje de error si falla la acción */}
        {state?.error && (
          <div className="rounded-xl border border-danger-300 bg-danger-50 p-4 text-sm text-danger-800 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-danger-600 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <Link
            href={`/loans/${loan.id}`}
            className="rounded-xl border border-ink-300 bg-white px-5 py-3 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
          >
            Cancelar
          </Link>
          <SubmitButton />
        </div>
      </form>

      {/* Modal de Confirmación de Eliminación */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4 backdrop-blur-xs">
          <div className="card w-full max-w-md p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-ink-100 pb-3">
              <div className="flex items-center gap-2 text-danger-600">
                <AlertTriangle size={20} />
                <h3 className="font-bold text-ink-900">¿Eliminar préstamo {loan.code}?</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="text-ink-400 hover:text-ink-600"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-ink-600 leading-relaxed">
              Esta acción es <strong>irreversible</strong>. Se eliminará el préstamo{" "}
              <span className="font-bold text-ink-900">{loan.code}</span>, su cronograma de cuotas,
              sus {loan.paymentsCount} pago(s) asociados y todos los movimientos en el libro mayor.
            </p>

            {deleteState?.error && (
              <p className="text-xs font-semibold text-danger-600 bg-danger-50 p-2.5 rounded-lg border border-danger-200">
                {deleteState.error}
              </p>
            )}

            <form action={deleteAction} className="flex items-center justify-end gap-2.5 pt-2">
              <input type="hidden" name="loanId" value={loan.id} />
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="rounded-lg border border-ink-200 px-3.5 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 cursor-pointer"
              >
                Cancelar
              </button>
              <DeleteSubmitButton />
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
