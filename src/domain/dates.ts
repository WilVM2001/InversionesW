import { addDays, addMonths, addWeeks, differenceInCalendarDays, formatISO, parseISO, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import type { Frequency } from "./types";

export function toDate(iso: string): Date {
  return startOfDay(parseISO(iso));
}

export function toIso(date: Date): string {
  return formatISO(date, { representation: "date" });
}

/** Suma un período a una fecha según la frecuencia del préstamo. */
export function addPeriods(date: Date, frequency: Frequency, periods: number): Date {
  switch (frequency) {
    case "DIARIA":
      return addDays(date, periods);
    case "SEMANAL":
      return addWeeks(date, periods);
    case "QUINCENAL":
      return addDays(date, periods * 15);
    case "MENSUAL":
      return addMonths(date, periods);
    case "BIMESTRAL":
      return addMonths(date, periods * 2);
    case "TRIMESTRAL":
      return addMonths(date, periods * 3);
    case "SEMESTRAL":
      return addMonths(date, periods * 6);
    case "ANUAL":
      return addMonths(date, periods * 12);
    default: {
      const exhaustive: never = frequency;
      throw new Error(`Frecuencia no soportada: ${exhaustive}`);
    }
  }
}

/** Días transcurridos entre dos fechas, contados a partir de la fecha dada. */
export function daysBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(startOfDay(to), startOfDay(from));
}

const FREQUENCY_LABELS: Record<Frequency, string> = {
  DIARIA: "Diaria",
  SEMANAL: "Semanal",
  QUINCENAL: "Quincenal",
  MENSUAL: "Mensual",
  BIMESTRAL: "Bimestral",
  TRIMESTRAL: "Trimestral",
  SEMESTRAL: "Semestral",
  ANUAL: "Anual",
};

export function frequencyLabel(frequency: Frequency): string {
  return FREQUENCY_LABELS[frequency];
}

/**
 * Fecha de hoy en hora LOCAL, formato ISO. No usar
 * `new Date().toISOString().slice(0, 10)`: eso es la fecha UTC y en
 * Colombia (UTC-5) después de las 7 p. m. devuelve el día siguiente.
 */
export function todayIso(): string {
  return toIso(new Date());
}

/**
 * Convierte una columna `@db.Date` leída con Prisma a ISO.
 * Prisma devuelve esas columnas como medianoche UTC; si se formatean en
 * hora local se verían como el día anterior. La parte de fecha correcta
 * es la UTC.
 */
export function dbDateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Fecha ISO -> Date a medianoche UTC, para filtrar columnas `@db.Date`. */
export function isoToDbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Formato de presentación para fechas de vencimiento.
 * Un `Date` se asume proveniente de una columna `@db.Date` (UTC).
 */
export function formatDate(iso: string | Date): string {
  const date = toDate(typeof iso === "string" ? iso : dbDateToIso(iso));
  return date.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Convierte un plazo expresado en meses al número de períodos de una
 * frecuencia dada. Se usa cuando el usuario escribe "12 meses" en un
 * préstamo semanal: 12 meses ≈ 52.18 períodos, que se redondea a 52.
 */
export function monthsToPeriods(months: number, frequency: Frequency): number {
  const perMonth: Record<Frequency, number> = {
    DIARIA: 30,
    SEMANAL: 4,
    QUINCENAL: 2,
    MENSUAL: 1,
    BIMESTRAL: 0.5,
    TRIMESTRAL: 1 / 3,
    SEMESTRAL: 1 / 6,
    ANUAL: 1 / 12,
  };
  return Math.max(1, Math.round(months * perMonth[frequency]));
}

export { es as dateLocale };