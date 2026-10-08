import { prisma } from "@/lib/prisma";
import { generateSchedule, scheduleTotals } from "@/domain/amortization";
import {
  buildSnapshots,
  outstandingBalance,
  portfolioSummary,
  planPayment,
} from "@/domain/payments";
import { rescheduleWithPrepayment } from "@/domain/prepayment";
import { toDate, dbDateToIso, isoToDbDate, todayIso } from "@/domain/dates";
import { percentToFraction } from "@/domain/money";
import type {
  AmortizationMethod,
  ExtraPaymentStrategy,
  Frequency,
  InterestType,
  LoanTerms,
  MoraRule,
  PaymentKind,
  ScheduleRow,
  SurplusMode,
} from "@/domain/types";
import { Prisma } from "@/generated/prisma/client";

/** Convierte los registros de Prisma a los tipos del dominio. */
function termsFromLoan(loan: {
  principal: Prisma.Decimal;
  rateSnapshot: Prisma.Decimal;
  frequencySnapshot: string;
  interestTypeSnapshot: string;
  methodSnapshot: string;
  termPeriods: number;
  disbursementDate: Date;
  firstDueDate?: Date | null;
  moraDailyRateSnapshot: Prisma.Decimal;
  moraGraceDaysSnapshot: number;
  moraCapPercentSnapshot: Prisma.Decimal | null;
  moraOnTotalSnapshot: boolean;
}): LoanTerms {
  const mora: MoraRule = {
    dailyRatePercent: Number(loan.moraDailyRateSnapshot),
    graceDays: loan.moraGraceDaysSnapshot,
    capPercentOfBalance:
      loan.moraCapPercentSnapshot === null ? null : Number(loan.moraCapPercentSnapshot),
    onTotalBalance: loan.moraOnTotalSnapshot,
  };
  return {
    principal: Number(loan.principal),
    rate: Number(loan.rateSnapshot),
    frequency: loan.frequencySnapshot as Frequency,
    interestType: loan.interestTypeSnapshot as InterestType,
    amortizationMethod: loan.methodSnapshot as AmortizationMethod,
    termPeriods: loan.termPeriods,
    disbursementDate: dbDateToIso(loan.disbursementDate),
    firstDueDate: loan.firstDueDate ? dbDateToIso(loan.firstDueDate) : null,
    mora,
  };
}

/** Genera el código siguiente de préstamo buscando el consecutivo más alto. */
async function getNextLoanCode(tx: Prisma.TransactionClient): Promise<string> {
  const lastLoan = await tx.loan.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });
  let nextNumber = 1;
  if (lastLoan?.code) {
    const match = lastLoan.code.match(/\d+/);
    if (match) {
      nextNumber = parseInt(match[0], 10) + 1;
    }
  }
  return `P-${String(nextNumber).padStart(5, "0")}`;
}

/** Genera el recibo siguiente de pago buscando el consecutivo más alto. */
async function getNextReceiptNo(tx: Prisma.TransactionClient): Promise<string> {
  const lastPayment = await tx.payment.findFirst({
    orderBy: { receiptNo: "desc" },
    select: { receiptNo: true },
  });
  let nextNumber = 1;
  if (lastPayment?.receiptNo) {
    const match = lastPayment.receiptNo.match(/\d+/);
    if (match) {
      nextNumber = parseInt(match[0], 10) + 1;
    }
  }
  return `R-${String(nextNumber).padStart(6, "0")}`;
}

/**
 * Carga un préstamo con su cronograma persistido en BD y calcula el estado
 * a una fecha de corte.
 */
export async function loadLoanView(loanId: string, asOf = new Date()) {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: {
      client: true,
      rateProfile: true,
      installments: { orderBy: { period: "asc" } },
      payments: { orderBy: { paidAt: "desc" }, include: { allocations: true } },
    },
  });
  if (!loan) return null;

  const terms = termsFromLoan(loan);

  // La base de datos es la fuente de verdad del cronograma.
  const rows: ScheduleRow[] = loan.installments.map((inst) => ({
    period: inst.period,
    dueDate: dbDateToIso(inst.dueDate),
    openingBalance: Number(inst.openingBalance),
    scheduledPayment: Number(inst.scheduledPayment),
    interest: Number(inst.interest),
    principal: Number(inst.principal),
    extraPrincipal: Number(inst.extraPrincipal),
    accruedMora: Number(inst.accruedMora),
    closingBalance: Number(inst.closingBalance),
    totalDue: Number(inst.scheduledPayment) + Number(inst.accruedMora),
  }));

  // Pagos ya aplicados agrupados por período
  const paidByPeriod = new Map<
    number,
    { mora: number; interest: number; principal: number }
  >();
  for (const p of loan.payments) {
    for (const a of p.allocations) {
      const acc = paidByPeriod.get(a.period) ?? { mora: 0, interest: 0, principal: 0 };
      if (a.type === "MORA") acc.mora += Number(a.amount);
      if (a.type === "INTERES") acc.interest += Number(a.amount);
      if (a.type === "CAPITAL" || a.type === "ABONO_EXTRA") acc.principal += Number(a.amount);
      paidByPeriod.set(a.period, acc);
    }
  }

  const rawSnapshots = buildSnapshots(rows, paidByPeriod, terms.mora, asOf);

  // Respetar estado ANULADA persistido en BD
  const snapshots = rawSnapshots.map((snap) => {
    const dbInst = loan.installments.find((i) => i.period === snap.row.period);
    if (dbInst?.status === "ANULADA") {
      return {
        ...snap,
        status: "ANULADA" as const,
        outstanding: 0,
        currentMora: 0,
      };
    }
    return snap;
  });

  const totals = scheduleTotals(rows.filter((_, idx) => snapshots[idx].status !== "ANULADA"));
  const summary = portfolioSummary(snapshots.filter((s) => s.status !== "ANULADA"));
  const collected = loan.payments.reduce((acc, p) => acc + Number(p.amount), 0);

  return {
    loan,
    client: loan.client,
    terms,
    rows,
    snapshots,
    totals,
    summary,
    collected,
    outstanding: outstandingBalance(snapshots),
    payments: loan.payments,
    nextDue: snapshots.find((s) => s.outstanding > 0 && s.status !== "ANULADA") ?? null,
  };
}

export interface CreateLoanInput {
  clientId: string;
  rateProfileId?: string | null;
  principal: number;
  ratePercent?: number | null; // % ingresado directamente (ej. 2 = 2%)
  rate?: number | null; // fracción directa (ej. 0.02)
  frequency?: Frequency | null;
  interestType?: InterestType | null;
  amortizationMethod?: AmortizationMethod | null;
  termPeriods: number;
  disbursementDate: string;
  firstDueDate?: string | null;
  moraDailyRatePercent?: number | null;
  moraGraceDays?: number | null;
  moraCapPercentOfBalance?: number | null;
  moraOnTotalBalance?: boolean | null;
  extraPaymentStrategy?: ExtraPaymentStrategy | null;
  notes?: string | null;
}

/**
 * Crea un préstamo y materializa su cronograma en una transacción atómica.
 * Permite configuración manual directa o basada en plantilla.
 * Registra el egreso de capital en el libro mayor.
 */
export async function createLoan(input: CreateLoanInput) {
  let rateProfile = null;
  if (input.rateProfileId) {
    rateProfile = await prisma.rateProfile.findUnique({
      where: { id: input.rateProfileId },
    });
    if (!rateProfile) throw new Error("La tasa seleccionada no existe.");
    if (!rateProfile.isActive) throw new Error("La tasa seleccionada está inactiva.");
  }

  // Resolver tasa
  let fractionRate: number;
  if (input.ratePercent != null && input.ratePercent > 0) {
    fractionRate = percentToFraction(input.ratePercent).toNumber();
  } else if (input.rate != null && input.rate >= 0) {
    fractionRate = input.rate;
  } else if (rateProfile) {
    fractionRate = Number(rateProfile.rate);
  } else {
    throw new Error("Debe ingresar la tasa de interés pactada.");
  }

  const frequency = (input.frequency ?? rateProfile?.frequency ?? "MENSUAL") as Frequency;
  const interestType = (input.interestType ?? rateProfile?.interestType ?? "COMPUESTA") as InterestType;
  const amortizationMethod = (input.amortizationMethod ??
    rateProfile?.amortizationMethod ??
    "OUTSTANDING_BALANCE") as AmortizationMethod;

  const moraDailyRate =
    input.moraDailyRatePercent ??
    (rateProfile ? Number(rateProfile.moraDailyRatePercent) : 0);
  const moraGraceDays =
    input.moraGraceDays ?? (rateProfile ? rateProfile.moraGraceDays : 0);
  const moraCapPercent =
    input.moraCapPercentOfBalance ??
    (rateProfile?.moraCapPercentOfBalance != null
      ? Number(rateProfile.moraCapPercentOfBalance)
      : null);
  const moraOnTotal =
    input.moraOnTotalBalance ?? (rateProfile ? rateProfile.moraOnTotalBalance : false);

  const extraStrategy = (input.extraPaymentStrategy ??
    rateProfile?.extraPaymentStrategy ??
    "REDUCIR_CUOTA") as ExtraPaymentStrategy;

  const terms: LoanTerms = {
    principal: input.principal,
    rate: fractionRate,
    frequency,
    interestType,
    amortizationMethod,
    termPeriods: input.termPeriods,
    disbursementDate: input.disbursementDate,
    firstDueDate: input.firstDueDate || null,
    mora: {
      dailyRatePercent: moraDailyRate,
      graceDays: moraGraceDays,
      capPercentOfBalance: moraCapPercent,
      onTotalBalance: moraOnTotal,
    },
  };

  const rows = generateSchedule(terms);
  const totals = scheduleTotals(rows);
  const disbursement = toDate(input.disbursementDate);
  const firstDue = input.firstDueDate ? toDate(input.firstDueDate) : toDate(rows[0].dueDate);

  const created = await prisma.$transaction(async (tx) => {
    const code = await getNextLoanCode(tx);

    const loan = await tx.loan.create({
      data: {
        code,
        clientId: input.clientId,
        rateProfileId: input.rateProfileId || null,
        principal: new Prisma.Decimal(input.principal),
        termPeriods: input.termPeriods,
        disbursementDate: disbursement,
        firstDueDate: firstDue,
        notes: input.notes ?? null,
        rateSnapshot: new Prisma.Decimal(fractionRate),
        frequencySnapshot: frequency,
        interestTypeSnapshot: interestType,
        methodSnapshot: amortizationMethod,
        moraDailyRateSnapshot: new Prisma.Decimal(moraDailyRate),
        moraGraceDaysSnapshot: moraGraceDays,
        moraCapPercentSnapshot:
          moraCapPercent != null ? new Prisma.Decimal(moraCapPercent) : null,
        moraOnTotalSnapshot: moraOnTotal,
        extraStrategySnapshot: extraStrategy,
      },
    });

    await tx.loanInstallment.createMany({
      data: rows.map((r) => ({
        loanId: loan.id,
        period: r.period,
        dueDate: toDate(r.dueDate),
        openingBalance: new Prisma.Decimal(r.openingBalance),
        scheduledPayment: new Prisma.Decimal(r.scheduledPayment),
        interest: new Prisma.Decimal(r.interest),
        principal: new Prisma.Decimal(r.principal),
        extraPrincipal: new Prisma.Decimal(r.extraPrincipal),
        accruedMora: new Prisma.Decimal(r.accruedMora),
        closingBalance: new Prisma.Decimal(r.closingBalance),
        status: "PENDIENTE" as const,
      })),
    });

    await tx.loanEvent.create({
      data: {
        loanId: loan.id,
        type: "DESEMBOLSO",
        amount: new Prisma.Decimal(input.principal),
        notes: `Desembolso de ${code}`,
      },
    });

    // Flujo de caja: egreso por capital entregado
    await tx.ledgerEntry.create({
      data: {
        loanId: loan.id,
        category: "CAPITAL",
        direction: "EGRESO",
        amount: new Prisma.Decimal(input.principal),
        entryDate: disbursement,
        notes: `Desembolso de préstamo ${code}`,
      },
    });

    return loan;
  });

  return { loan: created, totals };
}

export interface RegisterPaymentInput {
  loanId: string;
  amount: number;
  paidAt: string; // ISO YYYY-MM-DD
  method: string;
  kind?: PaymentKind; // "CUOTA" | "ABONO_CAPITAL" (default "CUOTA")
  surplusMode?: SurplusMode; // "ABONO_CAPITAL" | "ADELANTAR_CUOTAS" (default "ABONO_CAPITAL")
  extraStrategy?: ExtraPaymentStrategy;
  reference?: string | null;
  notes?: string | null;
  asOf?: Date;
}

/**
 * Registra un pago cuota a cuota y/o abono extraordinario a capital.
 * Todo ocurre dentro de una transacción atómica.
 */
export async function registerPayment(input: RegisterPaymentInput) {
  if (input.amount <= 0) throw new Error("El monto del pago debe ser mayor que cero.");

  const paidAtDate = toDate(input.paidAt);
  const asOf = input.asOf ?? paidAtDate;

  return prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUnique({
      where: { id: input.loanId },
      include: {
        client: true,
        installments: { orderBy: { period: "asc" } },
        payments: { orderBy: { paidAt: "desc" }, include: { allocations: true } },
      },
    });
    if (!loan) throw new Error("El préstamo no existe.");
    if (loan.status === "PAGADO") {
      throw new Error("El préstamo ya se encuentra completamente pagado.");
    }

    const terms = termsFromLoan(loan);

    // Cronograma actual desde la BD
    const rows: ScheduleRow[] = loan.installments.map((inst) => ({
      period: inst.period,
      dueDate: dbDateToIso(inst.dueDate),
      openingBalance: Number(inst.openingBalance),
      scheduledPayment: Number(inst.scheduledPayment),
      interest: Number(inst.interest),
      principal: Number(inst.principal),
      extraPrincipal: Number(inst.extraPrincipal),
      accruedMora: Number(inst.accruedMora),
      closingBalance: Number(inst.closingBalance),
      totalDue: Number(inst.scheduledPayment) + Number(inst.accruedMora),
    }));

    const paidByPeriod = new Map<
      number,
      { mora: number; interest: number; principal: number }
    >();
    for (const p of loan.payments) {
      for (const a of p.allocations) {
        const acc = paidByPeriod.get(a.period) ?? { mora: 0, interest: 0, principal: 0 };
        if (a.type === "MORA") acc.mora += Number(a.amount);
        if (a.type === "INTERES") acc.interest += Number(a.amount);
        if (a.type === "CAPITAL" || a.type === "ABONO_EXTRA") acc.principal += Number(a.amount);
        paidByPeriod.set(a.period, acc);
      }
    }

    const rawSnapshots = buildSnapshots(rows, paidByPeriod, terms.mora, asOf);
    const snapshots = rawSnapshots.map((snap) => {
      const dbInst = loan.installments.find((i) => i.period === snap.row.period);
      if (dbInst?.status === "ANULADA") {
        return { ...snap, status: "ANULADA" as const, outstanding: 0, currentMora: 0 };
      }
      return snap;
    });

    const plan = planPayment({
      snapshots,
      amount: input.amount,
      kind: input.kind,
      surplusMode: input.surplusMode,
      asOf,
    });

    const receiptNo = await getNextReceiptNo(tx);

    const payment = await tx.payment.create({
      data: {
        receiptNo,
        loanId: input.loanId,
        paidAt: paidAtDate,
        amount: new Prisma.Decimal(input.amount),
        method: input.method,
        kind: input.kind ?? "CUOTA",
        reference: input.reference ?? null,
        notes: input.notes ?? null,
      },
    });

    // 1. Asignaciones ordinarias
    if (plan.allocations.length > 0) {
      const appliedAllocations = plan.allocations.map((a) => {
        const inst = loan.installments.find((i) => i.period === a.period);
        return {
          paymentId: payment.id,
          installmentId: inst?.id ?? null,
          period: a.period,
          type: a.type as "MORA" | "INTERES" | "CAPITAL" | "ABONO_EXTRA",
          amount: new Prisma.Decimal(a.amount),
        };
      });

      await tx.paymentAllocation.createMany({ data: appliedAllocations });

      // Actualizar pagos en cuotas
      const byPeriod = new Map<number, { mora: number; interest: number; principal: number }>();
      for (const a of plan.allocations) {
        const acc = byPeriod.get(a.period) ?? { mora: 0, interest: 0, principal: 0 };
        if (a.type === "MORA") acc.mora += a.amount;
        if (a.type === "INTERES") acc.interest += a.amount;
        if (a.type === "CAPITAL") acc.principal += a.amount;
        byPeriod.set(a.period, acc);
      }

      for (const [period, paid] of byPeriod) {
        const inst = loan.installments.find((i) => i.period === period);
        if (!inst) continue;
        const totalPaidMora = Number(inst.paidMora) + paid.mora;
        const totalPaidInterest = Number(inst.paidInterest) + paid.interest;
        const totalPaidPrincipal = Number(inst.paidPrincipal) + paid.principal;
        const totalDue = Number(inst.scheduledPayment) + Number(inst.accruedMora);
        const settled = totalPaidMora + totalPaidInterest + totalPaidPrincipal;
        const isFullyPaid = settled >= totalDue - 0.01;

        await tx.loanInstallment.update({
          where: { id: inst.id },
          data: {
            paidMora: new Prisma.Decimal(totalPaidMora),
            paidInterest: new Prisma.Decimal(totalPaidInterest),
            paidPrincipal: new Prisma.Decimal(totalPaidPrincipal),
            status: isFullyPaid ? "PAGADA" : "PARCIAL",
            paidAt: isFullyPaid ? paidAtDate : inst.paidAt,
          },
        });
      }

      // Libro mayor: ingresos ordinarios
      for (const a of plan.allocations) {
        await tx.ledgerEntry.create({
          data: {
            loanId: input.loanId,
            paymentId: payment.id,
            category: a.type as "MORA" | "INTERES" | "CAPITAL",
            direction: "INGRESO",
            amount: new Prisma.Decimal(a.amount),
            entryDate: paidAtDate,
            notes: `Recibo ${receiptNo} (Cuota ${a.period} ${a.type.toLowerCase()})`,
          },
        });
      }
    }

    // 2. Abono extraordinario a capital (si aplica)
    if (plan.extraCapitalAmount > 0) {
      const openRows = plan.openSnapshotsForReschedule.map((s) => s.row);
      const strategy =
        input.extraStrategy ??
        (loan.extraStrategySnapshot as ExtraPaymentStrategy) ??
        "REDUCIR_CUOTA";

      if (openRows.length > 0) {
        const reschedule = rescheduleWithPrepayment({
          openRows,
          extraAmount: plan.extraCapitalAmount,
          rate: Number(loan.rateSnapshot),
          method: loan.methodSnapshot as AmortizationMethod,
          strategy,
          previousPayment: openRows[0]?.scheduledPayment,
        });

        // Registrar asignación ABONO_EXTRA
        const targetInst = loan.installments.find((i) => i.period === openRows[0].period);
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            installmentId: targetInst?.id ?? null,
            period: openRows[0].period,
            type: "ABONO_EXTRA",
            amount: new Prisma.Decimal(plan.extraCapitalAmount),
          },
        });

        // Actualizar cuotas recalculadas
        for (const updated of reschedule.updatedRows) {
          const inst = loan.installments.find((i) => i.period === updated.period);
          if (inst) {
            await tx.loanInstallment.update({
              where: { id: inst.id },
              data: {
                openingBalance: new Prisma.Decimal(updated.openingBalance),
                scheduledPayment: new Prisma.Decimal(updated.scheduledPayment),
                interest: new Prisma.Decimal(updated.interest),
                principal: new Prisma.Decimal(updated.principal),
                closingBalance: new Prisma.Decimal(updated.closingBalance),
                extraPrincipal:
                  updated.period === openRows[0].period
                    ? new Prisma.Decimal(Number(inst.extraPrincipal) + plan.extraCapitalAmount)
                    : inst.extraPrincipal,
              },
            });
          }
        }

        // Anular cuotas sobrantes si la estrategia fue REDUCIR_PLAZO
        for (const cancelled of reschedule.cancelledRows) {
          const inst = loan.installments.find((i) => i.period === cancelled.period);
          if (inst) {
            await tx.loanInstallment.update({
              where: { id: inst.id },
              data: {
                status: "ANULADA",
                openingBalance: new Prisma.Decimal(0),
                scheduledPayment: new Prisma.Decimal(0),
                interest: new Prisma.Decimal(0),
                principal: new Prisma.Decimal(0),
                closingBalance: new Prisma.Decimal(0),
              },
            });
          }
        }

        // Evento de auditoría del préstamo
        await tx.loanEvent.create({
          data: {
            loanId: input.loanId,
            type: "ABONO_EXTRA",
            amount: new Prisma.Decimal(plan.extraCapitalAmount),
            notes: `Abono extraordinario a capital: ${plan.extraCapitalAmount.toLocaleString("es-CO")} (${strategy})`,
            payload: {
              strategy,
              previousPayment: reschedule.previousPayment,
              newPayment: reschedule.newPayment,
              previousTerm: reschedule.previousTerm,
              newTerm: reschedule.newTerm,
              receiptNo,
            },
          },
        });

        // Libro mayor: ingreso de capital por abono extraordinario
        await tx.ledgerEntry.create({
          data: {
            loanId: input.loanId,
            paymentId: payment.id,
            category: "CAPITAL",
            direction: "INGRESO",
            amount: new Prisma.Decimal(plan.extraCapitalAmount),
            entryDate: paidAtDate,
            notes: `Abono extra capital - Recibo ${receiptNo}`,
          },
        });
      }
    }

    // 3. Verificar si el préstamo quedó totalmente pagado
    const remainingInstallments = await tx.loanInstallment.findMany({
      where: {
        loanId: input.loanId,
        status: { notIn: ["PAGADA", "ANULADA"] },
      },
    });

    const capitalPending = remainingInstallments.reduce(
      (acc, i) => acc + Math.max(0, Number(i.principal) - Number(i.paidPrincipal)),
      0,
    );

    const isFullySettled = capitalPending <= 0.01;
    if (isFullySettled) {
      await tx.loan.update({
        where: { id: input.loanId },
        data: {
          status: "PAGADO",
          paidOffAt: paidAtDate,
        },
      });
    }

    return {
      payment,
      applied: plan.allocations,
      extraCapitalAmount: plan.extraCapitalAmount,
      unapplied: plan.unapplied,
      isPaidOff: isFullySettled,
    };
  });
}

/** Marca vencidas las cuotas cuyo vencimiento ya pasó. */
export async function refreshOverdueStatuses(): Promise<number> {
  const cutoffIso = todayIso();
  const cutoffDate = isoToDbDate(cutoffIso);
  const result = await prisma.loanInstallment.updateMany({
    where: {
      dueDate: { lt: cutoffDate },
      status: { in: ["PENDIENTE", "PARCIAL"] },
    },
    data: { status: "VENCIDA" },
  });
  return result.count;
}