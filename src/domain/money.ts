import Decimal from "decimal.js";
import type { ScheduleRow } from "./types";

// 28 decimales de precisión interna. El redondeo a moneda ocurre solo
// en money() para que los cálculos intermedios no acumulen error.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type DecimalLike = Decimal | number | string;

export function dec(value: DecimalLike): Decimal {
  return new Decimal(value ?? 0);
}

/** Redondeo a centavos, el estándar para moneda. */
export const MONEY_DP = 2;

export function money(value: DecimalLike): Decimal {
  return dec(value).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);
}

/**
 * Redondeo interno del cronograma a 10 decimales.
 *
 * Las plantillas Excel calculan en precisión completa y solo redondean al
 * mostrar: K2 = 10.000.000/15 = 666666.6667 y L2 = K2*1.25 = 833333.3333.
 * Redondear a centavos en cada período acumularía centavos fantasma y el
 * total no cuadraría con el archivo. Por eso el cronograma se guarda con
 * alta precisión y el redondeo a moneda ocurre solo al cobrar y al mostrar.
 */
export const INTERNAL_DP = 10;

export function internal(value: DecimalLike): Decimal {
  return dec(value).toDecimalPlaces(INTERNAL_DP, Decimal.ROUND_HALF_UP);
}

export function sum(values: DecimalLike[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(dec(v)), new Decimal(0));
}

/**
 * Convierte un porcentaje (1.25 = 1.25%) a fracción (0.0125).
 * Evita repetir el error del prototipo Excel, donde 1.25 con formato
 * 0% se mostraba como 125%.
 */
export function percentToFraction(percent: DecimalLike): Decimal {
  return dec(percent).dividedBy(100);
}

/** Convierte una fracción (0.0125) a porcentaje (1.25). */
export function fractionToPercent(fraction: DecimalLike): Decimal {
  return dec(fraction).times(100);
}

/**
 * Cuota fija de una anualidad. Equivale a PMT(tasa, nper, -capital) en Excel:
 *   cuota = capital * r * (1+r)^n / ((1+r)^n - 1)
 */
export function annuityPayment(
  rate: DecimalLike,
  nper: number,
  pv: DecimalLike,
): Decimal {
  const r = dec(rate);
  const n = new Decimal(nper);
  const present = dec(pv);
  if (n.lte(0)) return new Decimal(0);
  if (r.isZero()) return money(present.dividedBy(n));
  const growth = new Decimal(1).plus(r).pow(n);
  return money(present.times(r).times(growth).dividedBy(growth.minus(1)));
}

/**
 * Ajusta el principal de una fila para forzar un saldo final exacto,
 * sin tocar el interés ya devengado. Se usa en la última cuota del
 * cronograma para que el saldo termine exactamente en cero.
 */
export function forceClosingBalance(row: ScheduleRow, targetBalance: number): void {
  row.principal = internal(dec(row.openingBalance).minus(targetBalance)).toNumber();
  row.closingBalance = internal(targetBalance).toNumber();
  // La cuota de la última fila debe seguir cuadrando con capital + interés.
  row.scheduledPayment = internal(dec(row.principal).plus(row.interest)).toNumber();
  row.totalDue = internal(dec(row.scheduledPayment).plus(row.accruedMora)).toNumber();
}

/** Lo que falta pagar en una fila: cuota programada más mora acumulada. */
export function totalDueOf(row: ScheduleRow): Decimal {
  return internal(dec(row.scheduledPayment).plus(row.accruedMora));
}

/**
 * Convierte un número a texto sin notación exponencial y con separador de
 * miles, para la interfaz. No es para cálculos.
 */
export function formatMoney(value: DecimalLike, fractionDigits = 2): string {
  return money(value).toFixed(fractionDigits);
}