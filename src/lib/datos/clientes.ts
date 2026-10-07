// Clientes: opcionales en la venta. Cada negocio tiene los suyos.
import { z } from "zod";
import type { TipoDocumento } from "@/generated/prisma/enums";
import { erroresPorCampo } from "@/lib/inventario/esquemas";
import { datosDe } from "./alcance";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, type Resultado } from "./inventario";

export const TIPOS_DOCUMENTO: Record<TipoDocumento, string> = {
  CC: "Cédula",
  NIT: "NIT",
  CE: "Cédula de extranjería",
  PASAPORTE: "Pasaporte",
  TI: "Tarjeta de identidad",
  OTRO: "Otro",
};

const opcional = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres.`).transform((v) => v || null).nullable().optional();

export const esquemaCliente = z
  .object({
    nombre: z.string().trim().min(2, "Escribe el nombre del cliente.").max(150),
    tipoDocumento: z.enum(["CC", "NIT", "CE", "PASAPORTE", "TI", "OTRO"]).nullable().optional(),
    numeroDocumento: opcional(30),
    telefono: opcional(30),
    correo: z
      .string()
      .trim()
      .max(150)
      .transform((v) => v || null)
      .refine((v) => v === null || /^\S+@\S+\.\S+$/.test(v), "Escribe un correo válido.")
      .nullable()
      .optional(),
    direccion: opcional(200),
  })
  .transform((c) => ({
    ...c,
    numeroDocumento: c.numeroDocumento?.replace(/[\s.]/g, "") || null,
    tipoDocumento: c.numeroDocumento ? (c.tipoDocumento ?? "CC") : null,
  }));

export type ClienteVista = {
  id: string;
  nombre: string;
  tipoDocumento: TipoDocumento | null;
  numeroDocumento: string | null;
  telefono: string | null;
};

const CAMPOS = { id: true, nombre: true, tipoDocumento: true, numeroDocumento: true, telefono: true } as const;

export async function buscarClientes(ctx: Contexto, negocioId: string, q: string): Promise<ClienteVista[]> {
  exigirNegocioPermitido(ctx, negocioId);
  const texto = q.trim();
  if (texto.length < 2) return [];
  const documento = texto.replace(/[\s.]/g, "");
  return datosDe(ctx).cliente.findMany({
    where: {
      negocioId,
      activo: true,
      OR: [
        { numeroDocumento: { startsWith: documento } },
        { telefono: { contains: documento } },
        { AND: texto.split(/\s+/).map((p) => ({ nombre: { contains: p, mode: "insensitive" as const } })) },
      ],
    },
    select: CAMPOS,
    orderBy: { nombre: "asc" },
    take: 8,
  });
}

export async function crearCliente(
  ctx: Contexto,
  negocioId: string,
  entrada: unknown,
): Promise<Resultado<{ id: string; cliente: ClienteVista }>> {
  exigirNegocioPermitido(ctx, negocioId);
  const datos = esquemaCliente.safeParse(entrada);
  if (!datos.success) return { ok: false, error: "Revisa los datos del cliente.", campos: erroresPorCampo(datos.error) };

  const tabla = datosDe(ctx).cliente;
  if (datos.data.numeroDocumento) {
    const existente = await tabla.findFirst({
      where: { negocioId, tipoDocumento: datos.data.tipoDocumento, numeroDocumento: datos.data.numeroDocumento },
      select: CAMPOS,
    });
    // Si ya existe, se usa ese en lugar de duplicarlo.
    if (existente) return { ok: true, id: existente.id, cliente: existente };
  }
  const cliente = await tabla.create({
    data: { empresaId: ctx.empresaId, negocioId, ...datos.data },
    select: CAMPOS,
  });
  return { ok: true, id: cliente.id, cliente };
}
