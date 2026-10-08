import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma 7 exige un driver adapter explícito. El pool de conexiones se
 * reutiliza entre recargas de Next.js en desarrollo para no abrir un pool
 * nuevo en cada hot reload.
 */
declare global {
  var prismaGlobal: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/inversiones_w";
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalThis.prismaGlobal ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}