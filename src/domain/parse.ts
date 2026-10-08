import Decimal from "decimal.js";
import { dec } from "./money";

/**
 * Parseo de números escritos por el usuario.
 *
 * En Colombia el punto suele ser separador de miles y la coma decimal
 * ("5.000.000,50"), pero la gente escribe tasas como "1.25". Un parser
 * ingenuo que borra todos los puntos convierte 1.25% en 125%. Aquí se
 * decide el separador decimal según el contexto.
 */

function clean(raw: string): string {
  // Quita "$", "%", "COP", espacios y cualquier otro símbolo.
  return raw.replace(/[^0-9.,-]/g, "");
}

function normalize(text: string, singleSeparatorIsDecimal: (sep: string, after: string) => boolean): string {
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");

  // Ambos separadores: el que aparece de último es el decimal.
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandSep = decimalSep === "." ? "," : ".";
    return text.split(thousandSep).join("").replace(decimalSep, ".");
  }

  const sep = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
  if (!sep) return text;

  const occurrences = text.split(sep).length - 1;
  // Varias apariciones del mismo separador: son miles ("5.000.000").
  if (occurrences > 1) return text.split(sep).join("");

  const after = text.slice(text.indexOf(sep) + 1);
  return singleSeparatorIsDecimal(sep, after) ? text.replace(sep, ".") : text.replace(sep, "");
}

function toDecimal(normalized: string): Decimal | null {
  if (normalized === "" || normalized === "-" || normalized === ".") return null;
  try {
    const value = dec(normalized);
    return value.isFinite() ? value : null;
  } catch {
    return null;
  }
}

/**
 * Monto de dinero. Un único separador seguido de exactamente 3 dígitos se
 * toma como miles ("5.000" = cinco mil); en otro caso es decimal
 * ("5000,5" = 5000.5).
 */
export function parseMoneyInput(raw: string | number | null | undefined): Decimal | null {
  if (raw === null || raw === undefined) return null;
  const text = clean(String(raw));
  return toDecimal(normalize(text, (_sep, after) => after.length !== 3));
}

/**
 * Porcentaje o número pequeño (tasas, días). Un único separador siempre es
 * decimal: "1.25" y "1,25" son 1,25 %.
 */
export function parsePercentInput(raw: string | number | null | undefined): Decimal | null {
  if (raw === null || raw === undefined) return null;
  const text = clean(String(raw));
  return toDecimal(normalize(text, () => true));
}

/** Entero positivo (número de cuotas, días de gracia). */
export function parseIntegerInput(raw: string | number | null | undefined): number | null {
  const value = parsePercentInput(raw);
  if (!value) return null;
  return value.isInteger() ? value.toNumber() : null;
}
