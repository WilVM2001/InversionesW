import { describe, expect, it } from "vitest";
import { annuityPayment, dec, money, percentToFraction } from "@/domain/money";
import { addPeriods, toDate, toIso } from "@/domain/dates";
import { generateSchedule, scheduleTotals, solvePrincipalFromPayment } from "@/domain/amortization";
import { DEFAULT_MORA_RULE, type LoanTerms } from "@/domain/types";

/**
 * Estos tests reproducen los números REALES de las dos plantillas Excel
 * entregadas. Si el motor no coincide con las plantillas, el test falla.
 */

describe("Plantilla de Control y Amortización (método francés)", () => {
  // Valores leídos del archivo: capital 5.000.000, tasa 0.02, plazo 12.
  const terms: LoanTerms = {
    principal: 5_000_000,
    rate: 0.02,
    frequency: "MENSUAL",
    interestType: "COMPUESTA",
    amortizationMethod: "OUTSTANDING_BALANCE",
    termPeriods: 12,
    // Serial Excel 46266.
    disbursementDate: "2026-09-01",
    mora: DEFAULT_MORA_RULE,
  };

  it("calcula la cuota igual a PMT de Excel", () => {
    // Excel: E7 = PMT(E5,E6,-E4) -> 472797.983114757
    expect(annuityPayment(0.02, 12, 5_000_000).toNumber()).toBe(472797.98);
  });

  it("reproduce el interés total de la celda E8", () => {
    // Excel: E8 = (E7*E6)-E4 -> 673575.79737708811
    const rows = generateSchedule(terms);
    const interest = scheduleTotals(rows).totalInterest;
    expect(interest).toBeCloseTo(673575.8, 1);
  });

  it("reproduce el total a invariably de la celda E9", () => {
    // Excel: E9 = E7*E6 -> 5673575.797377088
    const rows = generateSchedule(terms);
    const totals = scheduleTotals(rows);
    expect(totals.totalScheduled).toBeCloseTo(5673575.8, 1);
  });

  it("cierra el saldo exactamente en cero en la última cuota", () => {
    // Corrección del error de las plantillas: la fila 28 quedaba fuera
    // de los rangos de totales y el saldo nunca llegaba a cero.
    const rows = generateSchedule(terms);
    expect(rows).toHaveLength(12);
    expect(rows[11].closingBalance).toBe(0);
    expect(rows[11].period).toBe(12);
  });

  it("el interés de la primera cuota coincide con saldo por tasa", () => {
    const rows = generateSchedule(terms);
    // Excel: E17 = C17*$E$5 -> 5.000.000 * 0.02
    expect(rows[0].interest).toBe(100000);
  });

  it("genera doce vencimientos mensuales desde el desembolso", () => {
    const rows = generateSchedule(terms);
    // Excel: B17 = EDATE($B$7,1) -> 2026-10-01
    expect(rows[0].dueDate).toBe("2026-10-01");
    expect(rows[11].dueDate).toBe("2027-09-01");
  });

  it("el capital de la última cuota absorbe el residual", () => {
    const rows = generateSchedule(terms);
    const totals = scheduleTotals(rows);
    // La suma de capital debe ser exactamente el capital prestado.
    expect(totals.totalPrincipal).toBeCloseTo(5_000_000, 4);
  });

  it("la porción de capital crece cuota a cuota", () => {
    const rows = generateSchedule(terms);
    expect(rows[1].principal).toBeGreaterThan(rows[0].principal);
  });
});

describe("prototipo wdev (método plano sobre capital original)", () => {
  // Fila 2 del prototipo: 10.000.000, 15 cuotas, tasa 1.25.
  const terms: LoanTerms = {
    principal: 10_000_000,
    rate: 1.25,
    frequency: "SEMANAL",
    interestType: "SIMPLE",
    amortizationMethod: "ORIGINAL_CAPITAL",
    termPeriods: 15,
    disbursementDate: "2026-01-05",
    mora: DEFAULT_MORA_RULE,
  };

  it("reproduce la porción de capital de la columna K", () => {
    // Excel: K2 = G2/I2 -> 666666.6667
    const rows = generateSchedule(terms);
    expect(rows[0].principal).toBeCloseTo(666666.6667, 4);
  });

  it("reproduce el interés de la columna L", () => {
    // Excel: L2 = K2*J2 -> 833333.3333
    const rows = generateSchedule(terms);
    expect(rows[0].interest).toBeCloseTo(833333.3333, 4);
  });

  it("reproduce la cuota de la columna M", () => {
    // Excel: M2 = K2+L2 -> 1.500.000
    const rows = generateSchedule(terms);
    expect(rows[0].scheduledPayment).toBeCloseTo(1500000, 4);
  });

  it("mantiene la cuota constante en todos los períodos", () => {
    const rows = generateSchedule(terms);
    const first = rows[0].scheduledPayment;
    // Todas las cuotas son idénticas salvo la última, que absorbe un
    // residual sub-centavo para dejar el saldo exactamente en cero.
    for (const r of rows.slice(0, -1)) {
      expect(r.scheduledPayment).toBeCloseTo(first, 6);
    }
    expect(Math.abs(rows[rows.length - 1].scheduledPayment - first)).toBeLessThan(0.01);
  });

  it("el interés es igual en todas las cuotas (se cobra sobre el capital original)", () => {
    const rows = generateSchedule(terms);
    const interests = new Set(rows.map((r) => r.interest));
    expect(interests.size).toBe(1);
  });

  it("reproduce el total de la columna N con la tasa del archivo", () => {
    // Excel: N2 = M2*I2 -> 22.500.000
    const totals = scheduleTotals(generateSchedule(terms));
    expect(totals.totalScheduled).toBeCloseTo(22500000, 2);
  });

  it("reproduce la ganancia de la columna O con la tasa del archivo", () => {
    // Excel: O2 = N2-G2 -> 12.500.000
    const totals = scheduleTotals(generateSchedule(terms));
    expect(totals.totalInterest).toBeCloseTo(12500000, 2);
  });

  it("cerrar en cero la última cuota y cuadrar el capital", () => {
    const rows = generateSchedule(terms);
    const totals = scheduleTotals(rows);
    expect(rows[14].closingBalance).toBe(0);
    expect(totals.totalPrincipal).toBeCloseTo(10_000_000, 4);
  });
});

describe("Interpretación de tasas", () => {
  it("convierte 1.25 a fracción correctamente", () => {
    // El error del Excel: 1.25 con formato 0% se veía como 125%.
    expect(percentToFraction(1.25).toNumber()).toBe(0.0125);
  });

  it("convierte 2 a fracción correctamente", () => {
    expect(percentToFraction(2).toNumber()).toBe(0.02);
  });

  it("el prototipo con tasa realista de 1.25% da un resultado razonable", () => {
    // Si 1.25 es 1.25% y no 125%, el interés total del préstamo es de
    // 125.000, no de 12.500.000. Esta es la diferencia entre un préstamo
    // realista y uno que prestaría a tasa de usura.
    const totals = scheduleTotals(
      generateSchedule({
        principal: 10_000_000,
        rate: 0.0125,
        frequency: "SEMANAL",
        interestType: "SIMPLE",
        amortizationMethod: "ORIGINAL_CAPITAL",
        termPeriods: 15,
        disbursementDate: "2026-01-05",
        mora: DEFAULT_MORA_RULE,
      }),
    );
    expect(totals.totalInterest).toBeCloseTo(125_000, 4);
    expect(totals.totalScheduled).toBeCloseTo(10_125_000, 4);
  });
});

describe("Cierre del cronograma en todos los métodos", () => {
  const base: LoanTerms = {
    principal: 38_000_000,
    rate: 0.011,
    frequency: "MENSUAL",
    interestType: "COMPUESTA",
    amortizationMethod: "OUTSTANDING_BALANCE",
    termPeriods: 48,
    disbursementDate: "2026-09-01",
    mora: DEFAULT_MORA_RULE,
  };

  it("reproduce la cuota de la hoja Base (fila 2)", () => {
    // Excel: I2 = PMT(G2,H2,-F2) -> 1.023.220,9577
    expect(annuityPayment(0.011, 48, 38_000_000).toNumber()).toBe(1023220.96);
  });

  it("reproduce el interés total de la hoja Base", () => {
    // Excel: J2 = (I2*H2)-F2 -> 11.114.605,9715
    const totals = scheduleTotals(generateSchedule(base));
    expect(totals.totalInterest).toBeCloseTo(11_114_606, 0);
  });

  it("cierra en cero con tasas y plazos variables", () => {
    const cases: LoanTerms[] = [
      { ...base, principal: 1_000_000, rate: 0.015, termPeriods: 24 },
      { ...base, principal: 500_000, rate: 0.008, termPeriods: 60 },
      { ...base, principal: 20_000_000, rate: 0.03, termPeriods: 6, amortizationMethod: "ORIGINAL_CAPITAL" },
      { ...base, principal: 3_333_333, rate: 0, termPeriods: 7 },
    ];
    for (const c of cases) {
      const rows = generateSchedule(c);
      expect(rows[rows.length - 1].closingBalance).toBe(0);
      expect(scheduleTotals(rows).totalPrincipal).toBeCloseTo(c.principal, 4);
    }
  });

  it("lanza error con capital o plazo inválido", () => {
    expect(() => generateSchedule({ ...base, principal: 0 })).toThrow();
    expect(() => generateSchedule({ ...base, termPeriods: 0 })).toThrow();
  });
});

describe("Periodicidades y vencimientos", () => {
  it("calcula vencimientos semanales", () => {
    const d = toDate("2026-01-05");
    expect(toIso(addPeriods(d, "SEMANAL", 1))).toBe("2026-01-12");
    expect(toIso(addPeriods(d, "SEMANAL", 15))).toBe("2026-04-20");
  });

  it("calcula vencimientos quincenales con días exactos", () => {
    expect(toIso(addPeriods(toDate("2026-01-05"), "QUINCENAL", 1))).toBe("2026-01-20");
  });

  it("calcula vencimientos mensuales cruzando año", () => {
    expect(toIso(addPeriods(toDate("2026-11-15"), "MENSUAL", 3))).toBe("2027-02-15");
  });

  it("admite todas las frecuencias declaradas", () => {
    const all = ["DIARIA", "SEMANAL", "QUINCENAL", "MENSUAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"] as const;
    for (const f of all) {
      expect(toIso(addPeriods(toDate("2026-01-05"), f, 2))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("Aritmética decimal", () => {
  it("no arrastra error de punto flotante", () => {
    // 0.1 + 0.2 en float da 0.30000000000000004.
    expect(money(dec("0.1").plus("0.2")).toNumber()).toBe(0.3);
  });

  it("redondea a dos decimales con half-up", () => {
    expect(money("1.005").toNumber()).toBe(1.01);
  });

  it("acumula many sumas sin desviar", () => {
    let acc = dec(0);
    for (let i = 0; i < 1000; i += 1) acc = acc.plus("0.01");
    expect(acc.toNumber()).toBe(10);
  });
});

describe("firstDueDate manual (primer cobro independiente del desembolso)", () => {
  const baseTerms: LoanTerms = {
    principal: 2_000_000,
    rate: 0.03,
    frequency: "MENSUAL",
    interestType: "COMPUESTA",
    amortizationMethod: "OUTSTANDING_BALANCE",
    termPeriods: 4,
    disbursementDate: "2026-05-10",
    firstDueDate: "2026-06-01", // No es exactamente 1 mes después (10 de junio), sino el 1 de junio
    mora: DEFAULT_MORA_RULE,
  };

  it("respeta estrictamente firstDueDate como la fecha de la cuota 1", () => {
    const rows = generateSchedule(baseTerms);
    expect(rows[0].dueDate).toBe("2026-06-01");
  });

  it("calcula las cuotas subsiguientes a partir de firstDueDate respetando la frecuencia", () => {
    const rows = generateSchedule(baseTerms);
    expect(rows[0].dueDate).toBe("2026-06-01");
    expect(rows[1].dueDate).toBe("2026-07-01");
    expect(rows[2].dueDate).toBe("2026-08-01");
    expect(rows[3].dueDate).toBe("2026-09-01");
  });

  it("soporta firstDueDate con periodicidad semanal", () => {
    const weeklyTerms: LoanTerms = {
      ...baseTerms,
      frequency: "SEMANAL",
      disbursementDate: "2026-05-08", // Viernes
      firstDueDate: "2026-05-18",     // Lunes posterior (10 días después)
      termPeriods: 3,
    };
    const rows = generateSchedule(weeklyTerms);
    expect(rows[0].dueDate).toBe("2026-05-18");
    expect(rows[1].dueDate).toBe("2026-05-25");
    expect(rows[2].dueDate).toBe("2026-06-01");
  });

  it("si firstDueDate no se provee, calcula el primer vencimiento según la periodicidad estándar", () => {
    const withoutFirstDue = { ...baseTerms };
    delete withoutFirstDue.firstDueDate;
    const rows = generateSchedule(withoutFirstDue);
    expect(rows[0].dueDate).toBe("2026-06-10");
  });
});

describe("solvePrincipalFromPayment (Método inverso prototipo WDEV)", () => {
  it("despeja exactamente el capital de la fila 3 del prototipo wdev (400.000)", () => {
    // Fila 3: cuota 130.000, 4 cuotas, tasa 30% (0.3) -> capital 400.000
    const principal = solvePrincipalFromPayment(130_000, 4, 0.3);
    expect(principal).toBe(400_000);
  });

  it("despeja exactamente el capital de la fila 2 del prototipo wdev (10.000.000)", () => {
    // Fila 2: cuota 1.500.000, 15 cuotas, tasa 125% (1.25) -> capital 10.000.000
    const principal = solvePrincipalFromPayment(1_500_000, 15, 1.25);
    expect(principal).toBe(10_000_000);
  });

  it("despeja el caso del usuario (1.000.000 al 10% a 12 cuotas)", () => {
    // Cuota: 1.100.000 / 12 = 91666.67, 12 cuotas, tasa 10% (0.10) -> capital 1.000.000
    const principal = solvePrincipalFromPayment(1_100_000 / 12, 12, 0.1);
    expect(principal).toBeCloseTo(1_000_000, 1);
  });
});