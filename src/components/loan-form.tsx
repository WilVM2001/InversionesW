"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Calculator,
  Calendar,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { createLoanAction, type FormState } from "@/server/actions";
import { generateSchedule, scheduleTotals, solvePrincipalFromPayment } from "@/domain/amortization";
import { addPeriods, toDate, toIso, todayIso } from "@/domain/dates";
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
    >
      {pending ? (
        <>
          <Clock className="animate-spin h-5 w-5" />
          Creando préstamo y materializando cronograma...
        </>
      ) : (
        <>
          <CheckCircle2 className="h-5 w-5" />
          Guardar y Crear Préstamo
        </>
      )}
    </button>
  );
}

export function LoanForm({
  clients,
  rates,
  defaultClientId,
}: {
  clients: ClientOption[];
  rates: RateOption[];
  defaultClientId?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(createLoanAction, {});

  // Modo de ingreso: POR CAPITAL (Tradicional) o POR CUOTA DESEADA (Prototipo WDEV)
  const [inputMode, setInputMode] = useState<"BY_PRINCIPAL" | "BY_TARGET_PAYMENT">("BY_PRINCIPAL");

  // Campos manuales directos
  const [principalStr, setPrincipalStr] = useState("1.000.000");
  const [targetPaymentStr, setTargetPaymentStr] = useState("130.000");
  const [ratePercentStr, setRatePercentStr] = useState("10");
  const [frequency, setFrequency] = useState<Frequency>("MENSUAL");
  const [termPeriodsStr, setTermPeriodsStr] = useState("12");
  const [disbursementDate, setDisbursementDate] = useState(todayIso());
  const [firstDueDate, setFirstDueDate] = useState(() => {
    try {
      return toIso(addPeriods(toDate(todayIso()), "MENSUAL", 1));
    } catch {
      return "";
    }
  });

  // Método de cálculo: por defecto TASA FIJA DIRECTA (Original Capital / Interés Simple)
  const [amortizationMethod, setAmortizationMethod] = useState<AmortizationMethod>("ORIGINAL_CAPITAL");
  const [interestType, setInterestType] = useState<InterestType>("SIMPLE");
  const [flatRateScope, setFlatRateScope] = useState<"TOTAL" | "PERIODIC">("TOTAL");

  const [moraDailyRateStr, setMoraDailyRateStr] = useState("1");
  const [moraGraceDaysStr, setMoraGraceDaysStr] = useState("0");
  const [extraPaymentStrategy, setExtraPaymentStrategy] = useState<ExtraPaymentStrategy>("REDUCIR_CUOTA");
  const [showFullSchedule, setShowFullSchedule] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Al seleccionar plantilla de tasa, precargar los valores
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
    try {
      setFirstDueDate(toIso(addPeriods(toDate(disbursementDate), selected.frequency as Frequency, 1)));
    } catch {
      // noop
    }
  };

  const handleDisbursementChange = (newDisbursement: string) => {
    setDisbursementDate(newDisbursement);
    try {
      if (newDisbursement) {
        setFirstDueDate(toIso(addPeriods(toDate(newDisbursement), frequency, 1)));
      }
    } catch {
      // noop
    }
  };

  const handleFrequencyChange = (newFreq: Frequency) => {
    setFrequency(newFreq);
    try {
      if (disbursementDate) {
        setFirstDueDate(toIso(addPeriods(toDate(disbursementDate), newFreq, 1)));
      }
    } catch {
      // noop
    }
  };

  // Simulación y cálculo en tiempo real
  const simulation = useMemo(() => {
    const ratePercentDec = parsePercentInput(ratePercentStr);
    const periods = parseIntegerInput(termPeriodsStr);
    const moraRateDec = parsePercentInput(moraDailyRateStr);
    const graceDays = parseIntegerInput(moraGraceDaysStr) ?? 0;

    if (!ratePercentDec || ratePercentDec.lt(0) || !periods || periods <= 0) {
      return null;
    }

    // Cálculo de la tasa efectiva según el método y modalidad
    let effectiveRatePercent = ratePercentDec.toNumber();
    if (amortizationMethod === "ORIGINAL_CAPITAL" && flatRateScope === "PERIODIC") {
      effectiveRatePercent = ratePercentDec.times(periods).toNumber();
    }
    const rateFraction = percentToFraction(effectiveRatePercent).toNumber();

    // Determinar el capital a prestar:
    // En modo BY_TARGET_PAYMENT (Prototipo WDEV), se despeja de la cuota deseada
    let principal = 0;
    if (inputMode === "BY_TARGET_PAYMENT") {
      const targetPaymentDec = parseMoneyInput(targetPaymentStr);
      if (!targetPaymentDec || targetPaymentDec.lte(0)) return null;
      principal = solvePrincipalFromPayment(targetPaymentDec.toNumber(), periods, rateFraction);
    } else {
      const principalDec = parseMoneyInput(principalStr);
      if (!principalDec || principalDec.lte(0)) return null;
      principal = principalDec.toNumber();
    }

    if (principal <= 0) return null;

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
    inputMode,
    principalStr,
    targetPaymentStr,
    ratePercentStr,
    termPeriodsStr,
    frequency,
    disbursementDate,
    firstDueDate,
    amortizationMethod,
    interestType,
    flatRateScope,
    moraDailyRateStr,
    moraGraceDaysStr,
  ]);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <div className="rounded-lg bg-danger-500/10 p-4 text-sm text-danger-600 ring-1 ring-danger-500/25 ring-inset flex items-start gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <strong>Error al crear préstamo:</strong> {state.error}
          </div>
        </div>
      ) : null}

      {/* Inputs ocultos para enviar los valores calculados al server action */}
      <input type="hidden" name="amortizationMethod" value={amortizationMethod} />
      <input type="hidden" name="interestType" value={interestType} />
      <input
        type="hidden"
        name="ratePercent"
        value={simulation ? simulation.effectiveRatePercent : ratePercentStr}
      />
      {inputMode === "BY_TARGET_PAYMENT" && simulation ? (
        <input type="hidden" name="principal" value={simulation.principal} />
      ) : null}

      {/* 1. Cliente y Plantilla opcional */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="clientId">
            Cliente deudor *
          </label>
          <select
            id="clientId"
            name="clientId"
            required
            defaultValue={defaultClientId ?? ""}
            className="field font-medium"
          >
            <option value="">Selecciona un cliente...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — Doc. {c.documentId}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="rateTemplate">
            Cargar desde plantilla de tasa (Opcional)
          </label>
          <select
            id="rateTemplate"
            name="rateProfileId"
            className="field"
            defaultValue=""
            onChange={(e) => handleRateTemplateChange(e.target.value)}
          >
            <option value="">Ingreso 100% manual libre</option>
            {rates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({(r.rate * 100).toFixed(2)}% {r.frequency.toLowerCase()})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-500">
            Al seleccionar una plantilla se precargan los campos; puedes modificarlos libremente.
          </p>
        </div>
      </div>

      {/* 2. SELECTOR DE MODO DE INGRESO (TRADICIONAL vs PROTOTIPO WDEV) */}
      <div className="rounded-xl border border-brand-300 bg-brand-50/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold tracking-wider text-brand-800 uppercase flex items-center gap-1.5">
              <Sparkles size={15} className="text-brand-600" />
              ¿Cómo deseas ingresar el crédito?
            </span>
            <p className="text-xs text-ink-500">
              Elige si partes del capital a prestar o del valor de la cuota que el cliente pagará.
            </p>
          </div>
          <div className="flex rounded-lg bg-white p-1 ring-1 ring-brand-200">
            <button
              type="button"
              onClick={() => setInputMode("BY_PRINCIPAL")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                inputMode === "BY_PRINCIPAL"
                  ? "bg-brand-600 text-white shadow-xs"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              1. Ingresar Capital Prestado
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode("BY_TARGET_PAYMENT");
                setAmortizationMethod("ORIGINAL_CAPITAL");
                setInterestType("SIMPLE");
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                inputMode === "BY_TARGET_PAYMENT"
                  ? "bg-brand-600 text-white shadow-xs"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              2. Ingresar Cuota Deseada (Prototipo WDEV)
            </button>
          </div>
        </div>
      </div>

      {/* 3. SELECTOR DEL MÉTODO DE TASA (Visible siempre) */}
      <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-xs space-y-3">
        <label className="text-sm font-semibold text-ink-900 block">
          Método de cálculo del préstamo *
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Opción 1: Tasa Fija Directa */}
          <button
            type="button"
            onClick={() => {
              setAmortizationMethod("ORIGINAL_CAPITAL");
              setInterestType("SIMPLE");
            }}
            className={`rounded-xl border p-4 text-left transition relative cursor-pointer ${
              amortizationMethod === "ORIGINAL_CAPITAL"
                ? "border-brand-600 bg-brand-50/50 ring-2 ring-brand-500"
                : "border-ink-200 bg-white hover:bg-ink-50/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-900 text-sm">
                Tasa Fija / Interés Directo
              </span>
              {amortizationMethod === "ORIGINAL_CAPITAL" && (
                <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  Seleccionado
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink-600">
              Total = Capital + Tasa% fija. La cuota es Total ÷ Cuotas.
            </p>
            <div className="mt-2.5 rounded-md bg-brand-100/60 px-2.5 py-1 text-[11px] font-medium text-brand-900">
              Ej: $1.000.000 al 10% a 12 cuotas = $1.100.000 total → $91.667 por cuota.
            </div>
          </button>

          {/* Opción 2: Saldo Insoluto */}
          <button
            type="button"
            disabled={inputMode === "BY_TARGET_PAYMENT"}
            onClick={() => {
              setAmortizationMethod("OUTSTANDING_BALANCE");
              setInterestType("COMPUESTA");
            }}
            className={`rounded-xl border p-4 text-left transition relative cursor-pointer ${
              amortizationMethod === "OUTSTANDING_BALANCE"
                ? "border-brand-600 bg-brand-50/50 ring-2 ring-brand-500"
                : inputMode === "BY_TARGET_PAYMENT"
                  ? "opacity-50 border-ink-200 bg-ink-50 cursor-not-allowed"
                  : "border-ink-200 bg-white hover:bg-ink-50/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-900 text-sm">
                Sobre Saldo Insoluto (Francés PMT)
              </span>
              {amortizationMethod === "OUTSTANDING_BALANCE" && (
                <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  Seleccionado
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink-600">
              Cuota fija con amortización francesa. El interés se cobra sobre el saldo remanente decreciente.
            </p>
            <div className="mt-2.5 rounded-md bg-ink-100 px-2.5 py-1 text-[11px] font-medium text-ink-700">
              El interés baja a medida que se abona capital cuota a cuota.
            </div>
          </button>
        </div>

        {/* Modalidad de la Tasa Fija */}
        {amortizationMethod === "ORIGINAL_CAPITAL" && (
          <div className="mt-3 rounded-lg border border-brand-200/70 bg-brand-50/30 p-3 text-xs">
            <span className="font-semibold text-brand-900">Interpretación de la tasa fija:</span>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-ink-800">
                <input
                  type="radio"
                  name="flatScopeRadio"
                  checked={flatRateScope === "TOTAL"}
                  onChange={() => setFlatRateScope("TOTAL")}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span>
                  <strong>Tasa total del crédito</strong> (ej. 10% global sobre todo el crédito)
                </span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-ink-800">
                <input
                  type="radio"
                  name="flatScopeRadio"
                  checked={flatRateScope === "PERIODIC"}
                  onChange={() => setFlatRateScope("PERIODIC")}
                  className="text-brand-600 focus:ring-brand-500"
                />
                <span>
                  <strong>Tasa periódica por cuota</strong> (ej. {ratePercentStr || "2"}% en cada cuota → se multiplica por el plazo)
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* 4. Parámetros Principales del Crédito */}
      <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
          <Calculator size={18} className="text-brand-600" />
          {inputMode === "BY_TARGET_PAYMENT"
            ? "Parámetros del Prototipo WDEV (Por Cuota Deseada)"
            : "Condiciones del préstamo"}
        </h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {inputMode === "BY_TARGET_PAYMENT" ? (
            /* Modo Cuota Deseada (Prototipo WDEV) */
            <div>
              <label className="label text-brand-700 font-semibold" htmlFor="targetPayment">
                Valor de la cuota deseada ($) *
              </label>
              <input
                id="targetPayment"
                required
                inputMode="decimal"
                className="field tabular font-bold text-brand-700 border-brand-300 ring-brand-100"
                placeholder="Ej. 130.000"
                value={targetPaymentStr}
                onChange={(e) => setTargetPaymentStr(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-brand-600">
                Monto fijo que el cliente pagará cada período.
              </p>
            </div>
          ) : (
            /* Modo Tradicional (Por Capital) */
            <div>
              <label className="label" htmlFor="principal">
                Capital a prestar ($ COP) *
              </label>
              <input
                id="principal"
                name="principal"
                required
                inputMode="decimal"
                className="field tabular font-semibold text-ink-900"
                placeholder="Ej. 1.000.000"
                value={principalStr}
                onChange={(e) => setPrincipalStr(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor="frequency">
              Frecuencia de cobro *
            </label>
            <select
              id="frequency"
              name="frequency"
              required
              className="field font-medium"
              value={frequency}
              onChange={(e) => handleFrequencyChange(e.target.value as Frequency)}
            >
              <option value="DIARIA">Diaria</option>
              <option value="SEMANAL">Semanal</option>
              <option value="QUINCENAL">Quincenal</option>
              <option value="MENSUAL">Mensual</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="ratePercentInput">
              Tasa pactada (%) *
            </label>
            <div className="relative">
              <input
                id="ratePercentInput"
                required
                inputMode="decimal"
                className="field tabular font-semibold pr-8"
                placeholder="Ej. 10 o 30"
                value={ratePercentStr}
                onChange={(e) => setRatePercentStr(e.target.value)}
              />
              <span className="absolute right-3 top-2.5 text-xs font-semibold text-ink-400">%</span>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="termPeriods">
              Número de cuotas *
            </label>
            <input
              id="termPeriods"
              name="termPeriods"
              required
              inputMode="numeric"
              className="field tabular font-semibold"
              placeholder="Ej. 12"
              value={termPeriodsStr}
              onChange={(e) => setTermPeriodsStr(e.target.value)}
            />
          </div>
        </div>

        {/* Fechas: Desembolso y Primer Cobro */}
        <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-ink-100">
          <div>
            <label className="label flex items-center gap-1.5" htmlFor="disbursementDate">
              <Calendar size={14} className="text-ink-500" /> Fecha inicial de desembolso *
            </label>
            <input
              id="disbursementDate"
              name="disbursementDate"
              type="date"
              required
              value={disbursementDate}
              onChange={(e) => handleDisbursementChange(e.target.value)}
              className="field"
            />
          </div>

          <div>
            <label className="label flex items-center gap-1.5" htmlFor="firstDueDate">
              <Calendar size={14} className="text-brand-600" /> Fecha exacta del primer cobro (Cuota 1) *
            </label>
            <input
              id="firstDueDate"
              name="firstDueDate"
              type="date"
              required
              value={firstDueDate}
              onChange={(e) => setFirstDueDate(e.target.value)}
              className="field border-brand-300 focus:border-brand-500 ring-brand-100"
            />
            <p className="mt-1 text-xs text-ink-500">
              Se respeta exactamente este día para la cuota 1; las siguientes se calculan a partir de aquí.
            </p>
          </div>
        </div>
      </div>

      {/* 5. SIMULACIÓN Y CÁLCULO EN VIVO */}
      {simulation ? (
        <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/50 to-white p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-brand-100">
            <div>
              <p className="text-xs font-semibold tracking-wider text-brand-700 uppercase">
                Simulación en tiempo real (
                {inputMode === "BY_TARGET_PAYMENT"
                  ? "Prototipo WDEV: Cálculo Inverso por Cuota"
                  : amortizationMethod === "ORIGINAL_CAPITAL"
                    ? "Tasa Fija Directa"
                    : "Saldo Insoluto PMT"}
                )
              </p>
              <p className="text-xs text-ink-500">
                Calculado con precisión financiera Decimal.js (28 dígitos)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowFullSchedule(!showFullSchedule)}
              className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1 cursor-pointer"
            >
              {showFullSchedule ? (
                <>Ocultar cronograma <ChevronUp size={16} /></>
              ) : (
                <>Ver cronograma simulado ({simulation.rows.length} cuotas) <ChevronDown size={16} /></>
              )}
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Si es por cuota deseada, destacamos el CAPITAL RESULTANTE A DESEMBOLSAR */}
            {inputMode === "BY_TARGET_PAYMENT" ? (
              <div className="rounded-lg bg-brand-600 p-3.5 shadow-xs text-white">
                <p className="text-xs font-semibold text-brand-100 uppercase">
                  Resultado del Préstamo (Capital)
                </p>
                <p className="tabular mt-1 text-2xl font-bold text-white">
                  {formatCOPWhole(simulation.principal)}
                </p>
                <p className="text-[11px] text-brand-200 mt-0.5">
                  Monto a desembolsar al cliente
                </p>
              </div>
            ) : null}

            <div className="rounded-lg bg-white p-3.5 ring-1 ring-brand-300 shadow-xs">
              <p className="text-xs font-semibold text-brand-700 uppercase">Valor de la cuota</p>
              <p className="tabular mt-1 text-2xl font-bold text-brand-700">
                {formatCOP(simulation.cuotaRegular)}
              </p>
              <p className="text-[11px] text-ink-500 mt-0.5">
                {termPeriodsStr} pagos {frequency.toLowerCase()}es
              </p>
            </div>

            {inputMode !== "BY_TARGET_PAYMENT" ? (
              <div className="rounded-lg bg-white p-3.5 ring-1 ring-ink-200">
                <p className="text-xs text-ink-500 uppercase">Capital a desembolsar</p>
                <p className="tabular mt-1 text-xl font-bold text-ink-900">
                  {formatCOPWhole(simulation.principal)}
                </p>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  Principal colocado
                </p>
              </div>
            ) : null}

            <div className="rounded-lg bg-white p-3.5 ring-1 ring-ink-200">
              <p className="text-xs text-ink-500 uppercase">Total a recaudar</p>
              <p className="tabular mt-1 text-xl font-bold text-ink-900">
                {formatCOPWhole(simulation.totalScheduled)}
              </p>
              <p className="text-[11px] text-ink-500 mt-0.5">
                Capital + Total intereses
              </p>
            </div>

            <div className="rounded-lg bg-white p-3.5 ring-1 ring-ink-200">
              <p className="text-xs text-ink-500 uppercase">Ganancia de intereses</p>
              <p className="tabular mt-1 text-xl font-bold text-positive-600">
                {formatCOPWhole(simulation.totalInterest)}
              </p>
              <p className="text-[11px] text-ink-500 mt-0.5">
                Utilidad bruta proyectada
              </p>
            </div>
          </div>

          {/* Explicación de la fórmula aplicada */}
          <div className="mt-3 rounded-lg border border-brand-200/80 bg-white/95 p-3 text-xs text-ink-700 shadow-xs">
            <span className="font-semibold text-brand-800">Fórmula de cálculo: </span>
            {inputMode === "BY_TARGET_PAYMENT" ? (
              <span>
                Cuota {formatCOP(simulation.cuotaRegular)} × {termPeriodsStr} cuotas = {formatCOP(simulation.totalScheduled)} Total ÷ (1 + {simulation.effectiveRatePercent}%) → <strong>Capital a Prestar: {formatCOP(simulation.principal)}</strong>. Ganancia: {formatCOP(simulation.totalInterest)} ({formatCOP(simulation.totalInterest / Number(termPeriodsStr))} por cuota).
              </span>
            ) : amortizationMethod === "ORIGINAL_CAPITAL" ? (
              <span>
                Capital {formatCOP(simulation.terms.principal)} + {simulation.effectiveRatePercent}% interés ({formatCOP(simulation.totals.totalInterest)}) = <strong>{formatCOP(simulation.totals.totalScheduled)} total</strong> ÷ {termPeriodsStr} cuotas = <strong className="text-brand-700">{formatCOP(simulation.cuotaRegular)} por cuota</strong>.
              </span>
            ) : (
              <span>
                Cuota fija calculada por método francés sobre saldo decreciente = <strong className="text-brand-700">{formatCOP(simulation.cuotaRegular)} por cuota</strong> (Interés total: {formatCOP(simulation.totals.totalInterest)}, Total a pagar: {formatCOP(simulation.totals.totalScheduled)}).
              </span>
            )}
          </div>

          {/* Tabla de amortización simulada */}
          {showFullSchedule ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-ink-200 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-ink-50 border-b border-ink-200 text-ink-600">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-right">Saldo inicial</th>
                    <th className="px-3 py-2 text-right font-bold text-ink-900">Cuota</th>
                    <th className="px-3 py-2 text-right">Interés</th>
                    <th className="px-3 py-2 text-right">Capital</th>
                    <th className="px-3 py-2 text-right">Saldo final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {simulation.rows.map((row) => (
                    <tr key={row.period} className="hover:bg-brand-50/40">
                      <td className="tabular px-3 py-1.5 font-medium text-ink-500">{row.period}</td>
                      <td className="tabular px-3 py-1.5 font-medium">{formatDate(row.dueDate)}</td>
                      <td className="tabular px-3 py-1.5 text-right text-ink-600">{formatCOPWhole(row.openingBalance)}</td>
                      <td className="tabular px-3 py-1.5 text-right font-bold text-brand-700">{formatCOP(row.scheduledPayment)}</td>
                      <td className="tabular px-3 py-1.5 text-right text-positive-700 font-medium">{formatCOP(row.interest)}</td>
                      <td className="tabular px-3 py-1.5 text-right text-ink-600">{formatCOP(row.principal)}</td>
                      <td className="tabular px-3 py-1.5 text-right font-medium text-ink-800">{formatCOPWhole(row.closingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 6. Opciones Avanzadas (Mora y Abonos Extraordinarios) */}
      <div className="rounded-xl border border-ink-200 bg-white p-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between text-left text-xs font-semibold text-ink-700 hover:text-ink-900 cursor-pointer"
        >
          <span>Reglas de mora y abonos extraordinarios (Opcional)</span>
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showAdvanced ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 pt-3 border-t border-ink-100 text-sm">
            <div>
              <label className="label" htmlFor="moraDailyRatePercent">
                Mora diaria (%)
              </label>
              <input
                id="moraDailyRatePercent"
                name="moraDailyRatePercent"
                className="field tabular"
                value={moraDailyRateStr}
                onChange={(e) => setMoraDailyRateStr(e.target.value)}
                placeholder="1"
              />
            </div>

            <div>
              <label className="label" htmlFor="moraGraceDays">
                Días de gracia de mora
              </label>
              <input
                id="moraGraceDays"
                name="moraGraceDays"
                type="number"
                min={0}
                className="field tabular"
                value={moraGraceDaysStr}
                onChange={(e) => setMoraGraceDaysStr(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="label" htmlFor="extraPaymentStrategy">
                Estrategia ante abonos extraordinarios a capital
              </label>
              <select
                id="extraPaymentStrategy"
                name="extraPaymentStrategy"
                className="field"
                value={extraPaymentStrategy}
                onChange={(e) => setExtraPaymentStrategy(e.target.value as ExtraPaymentStrategy)}
              >
                <option value="REDUCIR_CUOTA">Reducir el valor de la cuota periódica (mantener plazo)</option>
                <option value="REDUCIR_PLAZO">Reducir el número de cuotas restantes (anular cuotas finales)</option>
              </select>
            </div>
          </div>
        ) : null}
      </div>

      {/* Notas opcionales */}
      <div>
        <label className="label" htmlFor="notes">
          Notas o condiciones particulares (Opcional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className="field"
          placeholder="Acuerdos especiales, fiador o garantía..."
        />
      </div>

      <SubmitButton />
    </form>
  );
}