/**
 * Datos iniciales de la aplicación.
 *
 * Es idempotente: se puede ejecutar varias veces sin duplicar registros.
 * Usa upsert por claves naturales (email, nombre de tasa, documento,
 * código de préstamo) en lugar de crear registros a ciegas.
 *
 * Las credenciales del administrador se pueden sobreescribir con
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD para no fijarlas en el repositorio.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { generateSchedule } from "../src/domain/amortization";
import { toIso } from "../src/domain/dates";
import type { Frequency, InterestType, AmortizationMethod, LoanTerms } from "../src/domain/types";

const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/inversiones_w",
});
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@inversionesw.co";
/**
 * Nunca se fija una contrasena real en el repositorio. Si no viene por
 * variable de entorno se genera una temporal al azar y se imprime una sola
 * vez en la consola del seed.
 */
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString("base64url");
const ADMIN_PASSWORD_IS_GENERATED = process.env.SEED_ADMIN_PASSWORD === undefined;

interface RateSeed {
  name: string;
  description: string;
  rate: number;
  frequency: Frequency;
  interestType: InterestType;
  amortizationMethod: AmortizationMethod;
  moraDailyRatePercent: number;
  moraGraceDays: number;
  moraCapPercentOfBalance: number | null;
  moraOnTotalBalance: boolean;
}

const RATES: RateSeed[] = [
  {
    name: "Mensual 2% sobre saldo",
    description: "Equivale a la plantilla de Control y Amortización (PMT/CUMPRINC).",
    rate: 0.02,
    frequency: "MENSUAL",
    interestType: "COMPUESTA",
    amortizationMethod: "OUTSTANDING_BALANCE",
    moraDailyRatePercent: 1,
    moraGraceDays: 0,
    moraCapPercentOfBalance: null,
    moraOnTotalBalance: false,
  },
  {
    name: "Mensual 1.25% sobre capital",
    description: "Equivale al prototipo lineal: interés sobre el capital original.",
    rate: 0.0125,
    frequency: "MENSUAL",
    interestType: "SIMPLE",
    amortizationMethod: "ORIGINAL_CAPITAL",
    moraDailyRatePercent: 1,
    moraGraceDays: 0,
    moraCapPercentOfBalance: null,
    moraOnTotalBalance: false,
  },
  {
    name: "Quincenal 1.5% sobre saldo",
    description: "Alternativa quincenal para comparación de flujos.",
    rate: 0.015,
    frequency: "QUINCENAL",
    interestType: "COMPUESTA",
    amortizationMethod: "OUTSTANDING_BALANCE",
    moraDailyRatePercent: 0.5,
    moraGraceDays: 3,
    moraCapPercentOfBalance: null,
    moraOnTotalBalance: true,
  },
];

const CLIENTS = [
  {
    documentId: "1000000001",
    firstName: "María",
    lastName: "Fernández",
    phone: "3001112233",
    email: "maria.fernandez@example.com",
    address: "Cra 12 #34-56",
    occupation: "Comerciante",
  },
  {
    documentId: "1000000002",
    firstName: "Jorge",
    lastName: "Ramírez",
    phone: "3012223344",
    email: "jorge.ramirez@example.com",
    address: "Av 68 #100-20",
    occupation: "Ingeniero",
  },
];

function termsFrom(rate: RateSeed, principal: number, termPeriods: number, date: string): LoanTerms {
  return {
    principal,
    rate: rate.rate,
    frequency: rate.frequency,
    interestType: rate.interestType,
    amortizationMethod: rate.amortizationMethod,
    termPeriods,
    disbursementDate: date,
    mora: {
      dailyRatePercent: rate.moraDailyRatePercent,
      graceDays: rate.moraGraceDays,
      capPercentOfBalance: rate.moraCapPercentOfBalance,
      onTotalBalance: rate.moraOnTotalBalance,
    },
  };
}

async function main(): Promise<void> {
  console.log("Sembrando datos iniciales...");

  // 1. Usuario administrador.
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash },
    create: {
      email: ADMIN_EMAIL,
      name: "Administrador",
      passwordHash,
      role: "ADMIN",
      isActive: true,
    },
  });
  console.log(`  usuario admin: ${ADMIN_EMAIL}`);
  if (ADMIN_PASSWORD_IS_GENERATED) {
    console.log(`  contrasena temporal: ${ADMIN_PASSWORD} (cambiala al primer ingreso)`);
  }

  // 2. Catalogo de tasas.
  for (const rate of RATES) {
    await prisma.rateProfile.upsert({
      where: { name: rate.name },
      update: {},
      create: {
        name: rate.name,
        description: rate.description,
        rate: rate.rate,
        frequency: rate.frequency,
        interestType: rate.interestType,
        amortizationMethod: rate.amortizationMethod,
        moraDailyRatePercent: rate.moraDailyRatePercent,
        moraGraceDays: rate.moraGraceDays,
        moraCapPercentOfBalance: rate.moraCapPercentOfBalance,
        moraOnTotalBalance: rate.moraOnTotalBalance,
        isActive: true,
      },
    });
  }
  console.log(`  tasas: ${RATES.length}`);

  // 3. Clientes de ejemplo.
  for (const client of CLIENTS) {
    await prisma.client.upsert({
      where: { documentId: client.documentId },
      update: {},
      create: { ...client, isActive: true },
    });
  }
  console.log(`  clientes: ${CLIENTS.length}`);

  // 4. Préstamos de ejemplo con cronograma materializado.
  const today = toIso(new Date());
  const loanSeeds = [
    { code: "P-0001", documentId: CLIENTS[0].documentId, rateIndex: 0, principal: 5_000_000, termPeriods: 12 },
    { code: "P-0002", documentId: CLIENTS[1].documentId, rateIndex: 1, principal: 10_000_000, termPeriods: 12 },
  ];

  for (const loanSeed of loanSeeds) {
    const rate = RATES[loanSeed.rateIndex];
    const client = await prisma.client.findUniqueOrThrow({
      where: { documentId: loanSeed.documentId },
    });
    const existing = await prisma.loan.findUnique({ where: { code: loanSeed.code } });
    if (existing) continue;

    const terms = termsFrom(rate, loanSeed.principal, loanSeed.termPeriods, today);
    const schedule = generateSchedule(terms);

    await prisma.loan.create({
      data: {
        code: loanSeed.code,
        clientId: client.id,
        status: "VIGENTE",
        rateSnapshot: rate.rate,
        frequencySnapshot: rate.frequency,
        interestTypeSnapshot: rate.interestType,
        methodSnapshot: rate.amortizationMethod,
        moraDailyRateSnapshot: rate.moraDailyRatePercent,
        moraGraceDaysSnapshot: rate.moraGraceDays,
        moraCapPercentSnapshot: rate.moraCapPercentOfBalance,
        moraOnTotalSnapshot: rate.moraOnTotalBalance,
        principal: loanSeed.principal,
        termPeriods: loanSeed.termPeriods,
        disbursementDate: new Date(today),
        firstDueDate: new Date(schedule[0].dueDate),
        installments: {
          create: schedule.map((row) => ({
            period: row.period,
            dueDate: new Date(row.dueDate),
            openingBalance: row.openingBalance,
            scheduledPayment: row.scheduledPayment,
            interest: row.interest,
            principal: row.principal,
            extraPrincipal: row.extraPrincipal,
            accruedMora: row.accruedMora,
            closingBalance: row.closingBalance,
            status: "PENDIENTE",
          })),
        },
        events: {
          create: {
            type: "DESEMBOLSO",
            amount: loanSeed.principal,
            notes: "Desembolso inicial generado por el seed.",
          },
        },
      },
    });
    console.log(`  prestamo: ${loanSeed.code} (${schedule.length} cuotas)`);
  }

  console.log("Seed completado.");
}

main()
  .catch((error) => {
    console.error("Error en el seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });