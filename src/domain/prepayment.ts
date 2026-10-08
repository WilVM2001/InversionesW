import { buildRows } from "./amortization";
import { dec, money } from "./money";
import type { AmortizationMethod, ExtraPaymentStrategy, ScheduleRow } from "./types";

export interface RescheduleInput {
  /**
   * Filas abiertas (futuras, sin pagos aplicados) que se van a reprogramar.
   */
  openRows: ScheduleRow[];
  /** Monto del abono extraordinario a capital. */
  extraAmount: number;
  /** Tasa por período como fracción (0.02 = 2%). */
  rate: number;
  method: AmortizationMethod;
  strategy: ExtraPaymentStrategy;
  /** Cuota periódica anterior para mantener en REDUCIR_PLAZO. */
  previousPayment?: number;
}

export interface RescheduleResult {
  /** Filas recalculadas que reemplazan las abiertas. */
  updatedRows: ScheduleRow[];
  /** Filas sobrantes que deben quedar anuladas. */
  cancelledRows: ScheduleRow[];
  previousPayment: number;
  newPayment: number;
  previousTerm: number;
  newTerm: number;
  capitalReduced: number;
  remainingCapital: number;
}

/**
 * Recalcula el cronograma de cuotas abiertas tras un abono a capital.
 */
export function rescheduleWithPrepayment(input: RescheduleInput): RescheduleResult {
  const { openRows, extraAmount, rate, method, strategy } = input;
  if (openRows.length === 0) {
    throw new Error("No hay cuotas abiertas para reprogramar.");
  }
  if (extraAmount <= 0) {
    throw new Error("El monto del abono a capital debe ser mayor que cero.");
  }

  // Capital total pendiente de las cuotas abiertas
  const openCapital = money(
    openRows.reduce((acc, r) => acc.plus(dec(r.principal)), dec(0)),
  ).toNumber();

  const prevPayment =
    input.previousPayment ?? openRows[0]?.scheduledPayment ?? 0;
  const previousTerm = openRows.length;

  // Si el abono cubre o supera el capital restante
  if (extraAmount >= openCapital) {
    return {
      updatedRows: [],
      cancelledRows: openRows.map((r) => ({
        ...r,
        scheduledPayment: 0,
        interest: 0,
        principal: 0,
        closingBalance: 0,
        totalDue: 0,
      })),
      previousPayment: prevPayment,
      newPayment: 0,
      previousTerm,
      newTerm: 0,
      capitalReduced: openCapital,
      remainingCapital: 0,
    };
  }

  const remainingCapital = money(dec(openCapital).minus(extraAmount)).toNumber();
  const startPeriod = openRows[0].period;
  const allDueDates = openRows.map((r) => r.dueDate);

  if (strategy === "REDUCIR_CUOTA") {
    // Mantiene el número de cuotas (plazo), recalculando una cuota menor
    const updatedRows = buildRows(
      remainingCapital,
      rate,
      method,
      allDueDates,
      startPeriod,
    );

    return {
      updatedRows,
      cancelledRows: [],
      previousPayment: prevPayment,
      newPayment: updatedRows[0]?.scheduledPayment ?? 0,
      previousTerm,
      newTerm: updatedRows.length,
      capitalReduced: extraAmount,
      remainingCapital,
    };
  }

  // ESTRATEGIA: REDUCIR_PLAZO
  // Mantiene la cuota periódica aprox. constante y acorta el plazo
  let neededPeriods = previousTerm;

  if (method === "ORIGINAL_CAPITAL") {
    // En cuota fija sobre capital original: cuota = P, capital = K = P / (1 + r)
    const factor = dec(1).plus(rate);
    const targetK = factor.isZero()
      ? dec(prevPayment)
      : dec(prevPayment).dividedBy(factor);

    if (targetK.greaterThan(0)) {
      neededPeriods = Math.ceil(dec(remainingCapital).dividedBy(targetK).toNumber());
    }
  } else {
    // OUTSTANDING_BALANCE (Anualidad PMT)
    if (rate <= 0) {
      neededPeriods = prevPayment > 0 ? Math.ceil(remainingCapital / prevPayment) : previousTerm;
    } else {
      const p = dec(prevPayment);
      const fPrime = dec(remainingCapital);
      const r = dec(rate);
      // n = -ln(1 - (F'*r / P)) / ln(1+r)
      const numeratorRatio = dec(1).minus(fPrime.times(r).dividedBy(p));
      if (numeratorRatio.greaterThan(0)) {
        const nExact = -Math.log(numeratorRatio.toNumber()) / Math.log(1 + rate);
        neededPeriods = Math.max(1, Math.ceil(nExact));
      }
    }
  }

  // No puede superar el plazo previo
  neededPeriods = Math.min(previousTerm, Math.max(1, neededPeriods));

  const activeDates = allDueDates.slice(0, neededPeriods);
  const updatedRows = buildRows(
    remainingCapital,
    rate,
    method,
    activeDates,
    startPeriod,
  );

  const cancelledRows = openRows.slice(neededPeriods).map((r) => ({
    ...r,
    scheduledPayment: 0,
    interest: 0,
    principal: 0,
    closingBalance: 0,
    totalDue: 0,
  }));

  return {
    updatedRows,
    cancelledRows,
    previousPayment: prevPayment,
    newPayment: updatedRows[0]?.scheduledPayment ?? prevPayment,
    previousTerm,
    newTerm: updatedRows.length,
    capitalReduced: extraAmount,
    remainingCapital,
  };
}
