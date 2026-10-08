import { NextResponse } from "next/server";
import { z } from "zod";
import { generateSchedule, scheduleTotals } from "@/domain/amortization";
import { computeMora } from "@/domain/amortization";
import { apiRequire, apiError, plain } from "@/server/api";
import { AMORTIZATION_METHODS, FREQUENCIES, INTEREST_TYPES } from "@/domain/types";

/**
 * Simula un cronograma sin persistir nada. Sirve para que el usuario vea
 * el efecto de los parámetros antes de crear el préstamo.
 */
const body = z.object({
  principal: z.number().positive(),
  rate: z.number().min(0),
  frequency: z.enum(FREQUENCIES),
  interestType: z.enum(INTEREST_TYPES),
  amortizationMethod: z.enum(AMORTIZATION_METHODS),
  termPeriods: z.number().int().positive(),
  disbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  moraDailyRatePercent: z.number().min(0).default(0),
  moraGraceDays: z.number().int().min(0).default(0),
  moraCapPercentOfBalance: z.number().min(0).nullable().default(null),
  moraOnTotalBalance: z.boolean().default(false),
});

export async function POST(request: Request) {
  const user = await apiRequire("loans:read");
  if (user instanceof NextResponse) return user;

  try {
    const input = body.parse(await request.json());
    const schedule = generateSchedule({
      principal: input.principal,
      rate: input.rate,
      frequency: input.frequency,
      interestType: input.interestType,
      amortizationMethod: input.amortizationMethod,
      termPeriods: input.termPeriods,
      disbursementDate: input.disbursementDate,
      firstDueDate: input.firstDueDate ?? undefined,
      mora: {
        dailyRatePercent: input.moraDailyRatePercent,
        graceDays: input.moraGraceDays,
        capPercentOfBalance: input.moraCapPercentOfBalance,
        onTotalBalance: input.moraOnTotalBalance,
      },
    });

    const moraSample = computeMora(schedule[0]?.closingBalance ?? 0, {
      dailyRatePercent: input.moraDailyRatePercent,
      graceDays: input.moraGraceDays,
      capPercentOfBalance: input.moraCapPercentOfBalance,
      onTotalBalance: input.moraOnTotalBalance,
    }, 30);

    return NextResponse.json(
      plain({ schedule, totals: scheduleTotals(schedule), moraAfter30Days: moraSample }),
    );
  } catch (error) {
    return apiError(error);
  }
}