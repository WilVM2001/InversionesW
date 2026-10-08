import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 mueve la conexión fuera del esquema: el CLI usa este archivo y
 * la aplicación pasa el adaptador a PrismaClient. La URL sigue viniendo del
 * entorno para no dejar credenciales en el repositorio.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/inversiones_w",
  },
});