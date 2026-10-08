import "server-only";
import { prisma } from "@/lib/prisma";
import { dec, money } from "@/domain/money";
import { toDate, dbDateToIso, isoToDbDate, todayIso, daysBetween } from "@/domain/dates";
import { computeMora } from "@/domain/amortization";
import { getMonthRange, computeMonthlyControl, type MonthlyControlMetrics } from "@/domain/portfolio";
import type { MoraRule } from "@/domain/types";
import { Prisma } from "@/generated/prisma/client";

export interface DashboardData {
  activeLoans: number;
  clients: number;
  // Cartera global activa
  principalOutstanding: number;
  interestPending: number;
  moraAccrued: number;
  overdueAmount: number;
  overdueCount: number;

  // Separación contable histórica
  historicalCapitalDelivered: number; // Capital total colocado
  historicalCapitalRecovered: number; // Retorno de principal (flujo, no utilidad)
  historicalProfit: number; // Ganancia real (interés + mora)
  historicalInterest: number;
  historicalMora: number;

  // Control mensual
  monthStr: string;
  monthLabel: string;
  monthlyControl: MonthlyControlMetrics;

  topOverdue: {
    id: string;
    code: string;
    clientName: string;
    documentId: string;
    overdueAmount: number;
    daysLate: number;
  }[];
  upcoming: {
    id: string;
    code: string;
    period: number;
    clientName: string;
    dueDate: Date;
    dueDateIso: string;
    amount: number;
    daysUntil: number;
  }[];
  byMonth: { month: string; principal: number; interest: number }[];
}

/**
 * Consulta integral para el Dashboard con separación contable
 * de capital vs ganancia y control mensual de metas.
 */
export async function getDashboard(monthStr?: string, daysUpcoming = 30): Promise<DashboardData> {
  const currentIso = todayIso();
  const todayDate = toDate(currentIso);
  const monthRange = getMonthRange(monthStr);

  const futureMaxDate = new Date(todayDate.getTime() + daysUpcoming * 24 * 60 * 60 * 1000);

  const [
    activeLoans,
    clientCount,
    allLedger,
    monthLedger,
    monthInstallments,
    overdueInstallments,
    upcomingRows,
  ] = await Promise.all([
    prisma.loan.count({ where: { status: "VIGENTE" } }),
    prisma.client.count({ where: { isActive: true } }),
    // Todo el libro mayor agrupado
    prisma.ledgerEntry.groupBy({
      by: ["category", "direction"],
      _sum: { amount: true },
    }),
    // Libro mayor solo del mes seleccionado
    prisma.ledgerEntry.groupBy({
      by: ["category"],
      where: {
        direction: "INGRESO",
        entryDate: { gte: monthRange.startDate, lt: monthRange.endDate },
      },
      _sum: { amount: true },
    }),
    // Cuotas que vencen en el mes seleccionado (para proyectar meta)
    prisma.loanInstallment.findMany({
      where: {
        dueDate: { gte: monthRange.startDate, lt: monthRange.endDate },
        status: { not: "ANULADA" },
      },
      select: {
        principal: true,
        interest: true,
      },
    }),
    // Cuotas vencidas con datos de préstamo para mora
    prisma.loanInstallment.findMany({
      where: { status: "VENCIDA" },
      include: {
        loan: {
          include: { client: true },
        },
      },
      orderBy: { dueDate: "asc" },
    }),
    // Próximos vencimientos
    prisma.loanInstallment.findMany({
      where: {
        status: { in: ["PENDIENTE", "PARCIAL"] },
        dueDate: { gte: isoToDbDate(currentIso), lte: futureMaxDate },
      },
      include: { loan: { include: { client: true } } },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
  ]);

  // Desglose del libro mayor histórico
  let historicalCapitalDelivered = 0;
  let historicalCapitalRecovered = 0;
  let historicalInterest = 0;
  let historicalMora = 0;

  for (const l of allLedger) {
    const val = Number(l._sum.amount ?? 0);
    if (l.category === "CAPITAL" && l.direction === "EGRESO") {
      historicalCapitalDelivered += val;
    } else if (l.category === "CAPITAL" && l.direction === "INGRESO") {
      historicalCapitalRecovered += val;
    } else if (l.category === "INTERES" && l.direction === "INGRESO") {
      historicalInterest += val;
    } else if (l.category === "MORA" && l.direction === "INGRESO") {
      historicalMora += val;
    }
  }

  // Si no había registros de egreso previos en ledger, calcular desde loans
  if (historicalCapitalDelivered === 0) {
    const totalLoansPrincipal = await prisma.loan.aggregate({ _sum: { principal: true } });
    historicalCapitalDelivered = Number(totalLoansPrincipal._sum.principal ?? 0);
  }

  const historicalProfit = historicalInterest + historicalMora;

  // Control mensual
  const monthMap = new Map(monthLedger.map((l) => [l.category, Number(l._sum.amount ?? 0)]));
  const targetPrincipal = monthInstallments.reduce((sum, i) => sum + Number(i.principal), 0);
  const targetInterest = monthInstallments.reduce((sum, i) => sum + Number(i.interest), 0);

  const monthlyControl = computeMonthlyControl({
    targetPrincipal,
    targetInterest,
    collectedPrincipal: monthMap.get("CAPITAL") ?? 0,
    collectedInterest: monthMap.get("INTERES") ?? 0,
    collectedMora: monthMap.get("MORA") ?? 0,
  });

  // Saldo insoluto de préstamos vigentes
  const activeLoansList = await prisma.loan.findMany({
    where: { status: "VIGENTE" },
    select: {
      id: true,
      installments: {
        where: { status: { not: "ANULADA" } },
        select: {
          principal: true,
          interest: true,
          paidPrincipal: true,
          paidInterest: true,
        },
      },
    },
  });

  let principalOutstanding = 0;
  let interestPending = 0;
  for (const loan of activeLoansList) {
    principalOutstanding += loan.installments.reduce(
      (acc, i) => acc + Math.max(0, Number(i.principal) - Number(i.paidPrincipal)),
      0,
    );
    interestPending += loan.installments.reduce(
      (acc, i) => acc + Math.max(0, Number(i.interest) - Number(i.paidInterest)),
      0,
    );
  }

  // Cálculo de mora real y montos vencidos
  let moraAccruedTotal = 0;
  let overdueAmount = 0;

  const topOverdue = overdueInstallments
    .map((inst) => {
      const dueDateIso = dbDateToIso(inst.dueDate);
      const daysLate = Math.max(0, daysBetween(toDate(dueDateIso), todayDate));

      const moraRule: MoraRule = {
        dailyRatePercent: Number(inst.loan.moraDailyRateSnapshot),
        graceDays: inst.loan.moraGraceDaysSnapshot,
        capPercentOfBalance: inst.loan.moraCapPercentSnapshot
          ? Number(inst.loan.moraCapPercentSnapshot)
          : null,
        onTotalBalance: inst.loan.moraOnTotalSnapshot,
      };

      const moraBase = Math.max(0, Number(inst.principal) - Number(inst.paidPrincipal));
      const currentMora = daysLate > 0 ? computeMora(moraBase, moraRule, daysLate) : 0;
      const unpaidMora = Math.max(0, currentMora + Number(inst.accruedMora) - Number(inst.paidMora));

      moraAccruedTotal += unpaidMora;

      const pendingInstallment = Math.max(
        0,
        Number(inst.scheduledPayment) +
          unpaidMora -
          Number(inst.paidInterest) -
          Number(inst.paidPrincipal),
      );

      overdueAmount += pendingInstallment;

      return {
        id: inst.loanId,
        code: inst.loan.code,
        clientName: `${inst.loan.client.firstName} ${inst.loan.client.lastName}`,
        documentId: inst.loan.client.documentId,
        overdueAmount: pendingInstallment,
        daysLate,
      };
    })
    .sort((a, b) => b.overdueAmount - a.overdueAmount)
    .slice(0, 6);

  // Próximos vencimientos
  const upcoming = upcomingRows.map((i) => {
    const dueIso = dbDateToIso(i.dueDate);
    const daysUntil = Math.max(0, daysBetween(todayDate, toDate(dueIso)));
    return {
      id: i.loanId,
      code: i.loan.code,
      period: i.period,
      clientName: `${i.loan.client.firstName} ${i.loan.client.lastName}`,
      dueDate: i.dueDate,
      dueDateIso: dueIso,
      amount: Number(i.scheduledPayment) - Number(i.paidInterest) - Number(i.paidPrincipal),
      daysUntil,
    };
  });

  // Rendimiento mensual últimos 12 meses
  type MonthlyLedger = { month: string; category: string; total: string };
  const monthly = await prisma.$queryRaw<MonthlyLedger[]>(Prisma.sql`
    SELECT to_char("entryDate", 'YYYY-MM') AS month,
           category,
           SUM(amount)::text AS total
    FROM ledger_entries
    WHERE direction = 'INGRESO'
    GROUP BY 1, 2
    ORDER BY 1 DESC
    LIMIT 60
  `);

  const historyMonthMap = new Map<string, { principal: number; interest: number }>();
  for (const row of monthly) {
    const entry = historyMonthMap.get(row.month) ?? { principal: 0, interest: 0 };
    const value = Number(row.total);
    if (row.category === "CAPITAL") entry.principal += value;
    if (row.category === "INTERES" || row.category === "MORA") entry.interest += value;
    historyMonthMap.set(row.month, entry);
  }

  const byMonth = [...historyMonthMap.entries()]
    .map(([month, v]) => ({
      month,
      principal: money(dec(v.principal)).toNumber(),
      interest: money(dec(v.interest)).toNumber(),
    }))
    .reverse()
    .slice(-12);

  return {
    activeLoans,
    clients: clientCount,
    principalOutstanding: money(principalOutstanding).toNumber(),
    interestPending: money(interestPending).toNumber(),
    moraAccrued: money(moraAccruedTotal).toNumber(),
    overdueAmount: money(overdueAmount).toNumber(),
    overdueCount: overdueInstallments.length,
    historicalCapitalDelivered: money(historicalCapitalDelivered).toNumber(),
    historicalCapitalRecovered: money(historicalCapitalRecovered).toNumber(),
    historicalProfit: money(historicalProfit).toNumber(),
    historicalInterest: money(historicalInterest).toNumber(),
    historicalMora: money(historicalMora).toNumber(),
    monthStr: monthRange.monthStr,
    monthLabel: monthRange.label,
    monthlyControl,
    topOverdue,
    upcoming,
    byMonth,
  };
}

/** Resumen financiero consolidado por cliente */
export async function getClientSummary(clientId: string) {
  const currentIso = todayIso();
  const todayDate = toDate(currentIso);

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      loans: {
        include: {
          installments: {
            where: { status: { not: "ANULADA" } },
            orderBy: { period: "asc" },
          },
        },
        orderBy: { disbursementDate: "desc" },
      },
    },
  });
  if (!client) return null;

  let totalDelivered = 0;
  let totalCapitalRecovered = 0;
  let capitalPending = 0;
  let interestCollected = 0;
  let interestPending = 0;
  let moraCollected = 0;
  let moraPending = 0;

  const overdueList: {
    loanCode: string;
    period: number;
    dueDateIso: string;
    daysLate: number;
    amount: number;
  }[] = [];

  const upcomingList: {
    loanCode: string;
    period: number;
    dueDateIso: string;
    daysUntil: number;
    amount: number;
  }[] = [];

  for (const loan of client.loans) {
    totalDelivered += Number(loan.principal);

    for (const inst of loan.installments) {
      const paidP = Number(inst.paidPrincipal);
      const paidI = Number(inst.paidInterest);
      const paidM = Number(inst.paidMora);
      const scheduledP = Number(inst.principal);
      const scheduledI = Number(inst.interest);

      totalCapitalRecovered += paidP;
      interestCollected += paidI;
      moraCollected += paidM;

      const pPending = Math.max(0, scheduledP - paidP);
      const iPending = Math.max(0, scheduledI - paidI);

      capitalPending += pPending;
      interestPending += iPending;

      const dueIso = dbDateToIso(inst.dueDate);
      const dueDate = toDate(dueIso);

      if (inst.status === "VENCIDA") {
        const daysLate = Math.max(0, daysBetween(dueDate, todayDate));
        const rule: MoraRule = {
          dailyRatePercent: Number(loan.moraDailyRateSnapshot),
          graceDays: loan.moraGraceDaysSnapshot,
          capPercentOfBalance: loan.moraCapPercentSnapshot
            ? Number(loan.moraCapPercentSnapshot)
            : null,
          onTotalBalance: loan.moraOnTotalSnapshot,
        };
        const currentMora = daysLate > 0 ? computeMora(pPending, rule, daysLate) : 0;
        const unpaidMora = Math.max(0, currentMora + Number(inst.accruedMora) - paidM);
        moraPending += unpaidMora;

        overdueList.push({
          loanCode: loan.code,
          period: inst.period,
          dueDateIso: dueIso,
          daysLate,
          amount: money(pPending + iPending + unpaidMora).toNumber(),
        });
      } else if (inst.status === "PENDIENTE" || inst.status === "PARCIAL") {
        const daysUntil = Math.max(0, daysBetween(todayDate, dueDate));
        upcomingList.push({
          loanCode: loan.code,
          period: inst.period,
          dueDateIso: dueIso,
          daysUntil,
          amount: money(pPending + iPending).toNumber(),
        });
      }
    }
  }

  return {
    client,
    totalDelivered: money(totalDelivered).toNumber(),
    totalCapitalRecovered: money(totalCapitalRecovered).toNumber(),
    capitalPending: money(capitalPending).toNumber(),
    interestCollected: money(interestCollected).toNumber(),
    interestPending: money(interestPending).toNumber(),
    moraCollected: money(moraCollected).toNumber(),
    moraPending: money(moraPending).toNumber(),
    overdueList: overdueList.sort((a, b) => b.daysLate - a.daysLate),
    upcomingList: upcomingList.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 10),
  };
}

export async function listClients(query?: string) {
  return prisma.client.findMany({
    where: query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { documentId: { contains: query } },
          ],
        }
      : undefined,
    include: {
      loans: {
        include: {
          installments: {
            where: { status: { not: "ANULADA" } },
            select: {
              principal: true,
              paidPrincipal: true,
              interest: true,
              paidInterest: true,
              paidMora: true,
            },
          },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });
}

export async function listLoans(status?: string) {
  return prisma.loan.findMany({
    where: status && status !== "TODOS" ? { status: status as never } : undefined,
    include: {
      client: true,
      installments: {
        where: { status: { not: "ANULADA" } },
        select: {
          principal: true,
          paidPrincipal: true,
          interest: true,
          paidInterest: true,
          status: true,
        },
      },
    },
    orderBy: { disbursementDate: "desc" },
    take: 300,
  });
}

export async function listRates() {
  return prisma.rateProfile.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}