import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiRequire, apiError, plain } from "@/server/api";
import { AMORTIZATION_METHODS, FREQUENCIES, INTEREST_TYPES } from "@/domain/types";

export async function GET() {
  const user = await apiRequire("rates:read");
  if (user instanceof NextResponse) return user;

  const rates = await prisma.rateProfile.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(plain(rates));
}

const rateBody = z.object({
  name: z.string().trim().min(1, "el nombre es obligatorio").max(80),
  description: z.string().max(300).optional().nullable(),
  rate: z.number().positive("la tasa debe ser mayor que cero"),
  frequency: z.enum(FREQUENCIES),
  interestType: z.enum(INTEREST_TYPES),
  amortizationMethod: z.enum(AMORTIZATION_METHODS),
  moraDailyRatePercent: z.number().min(0).default(0),
  moraGraceDays: z.number().int().min(0).default(0),
  moraCapPercentOfBalance: z.number().min(0).nullable().default(null),
  moraOnTotalBalance: z.boolean().default(false),
});

export async function POST(request: Request) {
  const user = await apiRequire("rates:write");
  if (user instanceof NextResponse) return user;

  try {
    const body = rateBody.parse(await request.json());
    const rate = await prisma.rateProfile.create({ data: { ...body, isActive: true } });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "create",
        entity: "RateProfile",
        entityId: rate.id,
        details: { name: rate.name, rate: body.rate },
      },
    });
    return NextResponse.json(plain(rate), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}