import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 mueve la conexión fuera del esquema: el CLI usa este archivo y
 * la aplicación pasa el adaptador a PrismaClient. La URL sigue viniendo del
 * entorno para no dejar credenciales en el repositorio.
 *
 * En Supabase hay dos cadenas de conexión:
 *   DIRECT_URL    puerto 5432, sin pooler -> solo la usan las MIGRACIONES.
 *   DATABASE_URL  puerto 6543, con pooler -> la usa la app en producción.
 * En local no hay DIRECT_URL y se usa DATABASE_URL para todo.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/inversiones_w",
  },
});