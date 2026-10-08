"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createRateAction, type FormState } from "@/server/actions";

const FREQUENCIES = [
  { value: "DIARIA", label: "Diaria" },
  { value: "SEMANAL", label: "Semanal" },
  { value: "QUINCENAL", label: "Quincenal" },
  { value: "MENSUAL", label: "Mensual" },
  { value: "BIMESTRAL", label: "Bimestral" },
  { value: "TRIMESTRAL", label: "Trimestral" },
  { value: "SEMESTRAL", label: "Semestral" },
  { value: "ANUAL", label: "Anual" },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Guardando..." : "Crear tasa"}
    </button>
  );
}

export function RateForm() {
  const [state, formAction] = useActionState<FormState, FormData>(createRateAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-lg bg-danger-500/10 px-3 py-2 text-sm text-danger-600 ring-1 ring-danger-500/25 ring-inset">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-lg bg-positive-500/10 px-3 py-2 text-sm text-positive-600 ring-1 ring-positive-500/25 ring-inset">
          {state.ok}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">
            Nombre de la tasa
          </label>
          <input
            id="name"
            name="name"
            required
            className="field"
            placeholder="Mensual 2% anticipada"
          />
        </div>
        <div>
          <label className="label" htmlFor="ratePercent">
            Tasa por período (%)
          </label>
          <input
            id="ratePercent"
            name="ratePercent"
            required
            inputMode="decimal"
            className="field tabular"
            placeholder="2"
          />
          <p className="mt-1 text-xs text-ink-500">
            Escribe el porcentaje tal como lo ves (ej. 2 o 1.25).
          </p>
        </div>
        <div>
          <label className="label" htmlFor="frequency">
            Periodicidad
          </label>
          <select id="frequency" name="frequency" required className="field" defaultValue="MENSUAL">
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="interestType">
            Tipo de interés
          </label>
          <select
            id="interestType"
            name="interestType"
            required
            className="field"
            defaultValue="COMPUESTA"
          >
            <option value="COMPUESTA">Compuesta (sobre saldo)</option>
            <option value="SIMPLE">Simple (sobre capital original)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="amortizationMethod">
            Método de amortización
          </label>
          <select
            id="amortizationMethod"
            name="amortizationMethod"
            required
            className="field"
            defaultValue="OUTSTANDING_BALANCE"
          >
            <option value="OUTSTANDING_BALANCE">Sobre saldo insoluto</option>
            <option value="ORIGINAL_CAPITAL">Sobre capital original</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="extraPaymentStrategy">
            Estrategia ante abono a capital
          </label>
          <select
            id="extraPaymentStrategy"
            name="extraPaymentStrategy"
            className="field"
            defaultValue="REDUCIR_CUOTA"
          >
            <option value="REDUCIR_CUOTA">Reducir cuota periódica (mantiene plazo)</option>
            <option value="REDUCIR_PLAZO">Reducir plazo (anula cuotas finales)</option>
          </select>
          <p className="mt-1 text-xs text-ink-500">
            Regla por defecto al recibir abonos extraordinarios a capital.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="moraDailyRatePercent">
            Mora diaria (%)
          </label>
          <input
            id="moraDailyRatePercent"
            name="moraDailyRatePercent"
            inputMode="decimal"
            defaultValue="0"
            className="field tabular"
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
            min={0}
            defaultValue="0"
            className="field tabular"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="description">
          Descripción
        </label>
        <input id="description" name="description" className="field" />
      </div>

      <Submit />
    </form>
  );
}