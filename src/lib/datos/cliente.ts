// Cliente de Prisma SIN filtros. Solo se usa dentro de src/lib/datos/.
// El resto de la app consulta la base con datosDe(contexto) (ver alcance.ts),
// que filtra siempre por la empresa y los negocios del usuario.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function crearCliente() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// En desarrollo Next.js recarga los módulos; guardamos el cliente en globalThis
// para no abrir una conexión nueva en cada recarga.
const globalParaPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof crearCliente>;
};

export const prisma = globalParaPrisma.prisma ?? crearCliente();

if (process.env.NODE_ENV !== "production") globalParaPrisma.prisma = prisma;
