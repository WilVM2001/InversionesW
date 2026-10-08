import { generateSchedule } from "./src/domain/amortization";
import { buildSnapshots, applyPayment } from "./src/domain/payments";
import { toDate } from "./src/domain/dates";
import { DEFAULT_MORA_RULE, type LoanTerms } from "./src/domain/types";

const terms: LoanTerms = {
  principal: 5_000_000, rate: 0.02, frequency: "MENSUAL",
  interestType: "COMPUESTA", amortizationMethod: "OUTSTANDING_BALANCE",
  termPeriods: 12, disbursementDate: "2026-09-01", mora: DEFAULT_MORA_RULE,
};
const rows = generateSchedule(terms);
console.log("filas:", rows.length);
console.log("fila1:", JSON.stringify(rows[0], null, 1));
const snaps = buildSnapshots(rows, new Map(), DEFAULT_MORA_RULE, toDate("2026-09-20"));
console.log("snap0:", JSON.stringify(snaps[0], null, 1));
console.log("apply:", JSON.stringify(applyPayment(snaps, 100000), null, 1));
