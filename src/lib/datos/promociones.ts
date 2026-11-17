// Promociones con fecha: se escogen prendas, productos o categorías completas y la caja
// aplica el descuento sola entre las fechas. Ver src/lib/ventas/promociones.ts.
import { z } from "zod";
import { diaEnBogota, formatearPesos } from "@/lib/formato";
import { exigirGestion } from "@/lib/permisos";
import { paraBuscar } from "@/lib/texto";
import { textoPromo } from "@/lib/ventas/promociones";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, registrarAuditoria, type Resultado } from "./inventario";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escoge la fecha.");

export const esquemaPromocion = z
  .object({
    nombre: z.string().trim().min(1, "Ponle un nombre, por ejemplo Black Friday.").max(60),
    tipo: z.enum(["PORCENTAJE", "PRECIO"]),
    valor: z.coerce.number().int("Escribe un número sin decimales.").positive("Escribe el descuento."),
    desde: dia,
    hasta: dia,
    prendaIds: z.array(z.string().max(40)).max(500).default([]),
    productoIds: z.array(z.string().max(40)).max(500).default([]),
    categoriaIds: z.array(z.string().max(40)).max(100).default([]),
  })
  .superRefine((p, ctx) => {
    if (p.tipo === "PORCENTAJE" && p.valor >= 100) ctx.addIssue({ code: "custom", path: ["valor"], message: "El porcentaje debe ser menor que 100." });
    if (p.hasta < p.desde) ctx.addIssue({ code: "custom", path: ["hasta"], message: "La fecha final va después de la inicial." });
    if (!p.prendaIds.length && !p.productoIds.length && !p.categoriaIds.length) {
      ctx.addIssue({ code: "custom", path: ["prendas"], message: "Escoge al menos una prenda o una categoría." });
    }
  });

export type EstadoPromocion = "vigente" | "programada" | "terminada";

export type PromocionVista = {
  id: string;
  nombre: string;
  descuento: string;
  desde: string;
  hasta: string;
  estado: EstadoPromocion;
  productos: number;
};

const aDia = (d: Date) => d.toISOString().slice(0, 10);

export async function listarPromociones(ctx: Contexto, negocioId: string): Promise<PromocionVista[]> {
  exigirNegocioPermitido(ctx, negocioId);
  const hoy = diaEnBogota();
  const filas = await datosDe(ctx).promocion.findMany({
    where: { negocioId },
    select: { id: true, nombre: true, tipo: true, valor: true, desde: true, hasta: true, activa: true, incluidos: true },
    orderBy: [{ desde: "desc" }, { creadoEn: "desc" }],
    take: 100,
  });
  return filas.map((f) => {
    const desde = aDia(f.desde);
    const hasta = aDia(f.hasta);
    const estado: EstadoPromocion = !f.activa || hasta < hoy ? "terminada" : desde > hoy ? "programada" : "vigente";
    return { id: f.id, nombre: f.nombre, descuento: textoPromo(f, formatearPesos), desde, hasta, estado, productos: f.incluidos };
  });
}

/** Crea la promoción y le pasa los productos escogidos (si estaban en otra, cambian a esta). */
export async function crearPromocion(ctx: Contexto, negocioId: string, entrada: unknown): Promise<Resultado<{ id: string; productos: number }>> {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const r = esquemaPromocion.safeParse(entrada);
  if (!r.success) {
    const primero = r.error.issues[0];
    return { ok: false, error: primero?.message ?? "Revisa los datos." };
  }
  const p = r.data;
  const productos = await datosDe(ctx).producto.findMany({
    where: {
      negocioId,
      activo: true,
      OR: [
        ...(p.prendaIds.length ? [{ prendaId: { in: p.prendaIds } }] : []),
        ...(p.productoIds.length ? [{ id: { in: p.productoIds } }] : []),
        ...(p.categoriaIds.length ? [{ categoriaId: { in: p.categoriaIds } }] : []),
      ],
    },
    select: { id: true, precioVenta: true },
    take: 20000,
  });
  if (!productos.length) return { ok: false, error: "No encontramos productos activos en lo que escogiste." };
  if (p.tipo === "PRECIO" && productos.every((x) => x.precioVenta <= p.valor)) {
    return { ok: false, error: "El precio de promoción debe ser menor que el precio normal." };
  }

  const id = await prisma.$transaction(async (tx) => {
    const promo = await tx.promocion.create({
      data: {
        empresaId: ctx.empresaId,
        negocioId,
        nombre: p.nombre,
        tipo: p.tipo,
        valor: p.valor,
        desde: new Date(`${p.desde}T00:00:00.000Z`),
        hasta: new Date(`${p.hasta}T00:00:00.000Z`),
        incluidos: productos.length,
      },
      select: { id: true },
    });
    await tx.producto.updateMany({
      where: { empresaId: ctx.empresaId, negocioId, id: { in: productos.map((x) => x.id) } },
      data: { promocionId: promo.id },
    });
    await registrarAuditoria(tx, ctx, {
      negocioId,
      accion: "PROMOCION",
      entidad: "Promocion",
      entidadId: promo.id,
      detalle: { nombre: p.nombre, descuento: textoPromo(p, formatearPesos), desde: p.desde, hasta: p.hasta, productos: productos.length },
    });
    return promo.id;
  });
  return { ok: true, id, productos: productos.length };
}

/** Termina la promoción ya: los productos vuelven a su precio normal en la caja. */
export async function terminarPromocion(ctx: Contexto, id: string): Promise<Resultado> {
  exigirGestion(ctx);
  const promo = await datosDe(ctx).promocion.findFirst({ where: { id }, select: { id: true, negocioId: true, nombre: true } });
  if (!promo) return { ok: false, error: "No encontramos esa promoción." };
  await prisma.$transaction(async (tx) => {
    await tx.promocion.update({ where: { id: promo.id }, data: { activa: false } });
    await tx.producto.updateMany({ where: { empresaId: ctx.empresaId, promocionId: promo.id }, data: { promocionId: null } });
    await registrarAuditoria(tx, ctx, {
      negocioId: promo.negocioId,
      accion: "PROMOCION_TERMINADA",
      entidad: "Promocion",
      entidadId: promo.id,
      detalle: { nombre: promo.nombre },
    });
  });
  return { ok: true, id: promo.id };
}

export type OpcionPromocion = { clave: string; nombre: string; detalle: string };

/** Buscar qué meter en la promoción: una prenda (todas sus tallas y colores) o un producto suelto. */
export async function buscarParaPromocion(ctx: Contexto, negocioId: string, texto: string): Promise<OpcionPromocion[]> {
  exigirNegocioPermitido(ctx, negocioId);
  const q = texto.trim().slice(0, 100);
  if (!q) return [];
  const palabras = q.split(/\s+/).filter(Boolean).slice(0, 6);
  const filas = await datosDe(ctx).producto.findMany({
    where: {
      negocioId,
      activo: true,
      OR: [
        { codigo: { startsWith: q, mode: "insensitive" } },
        { AND: palabras.map((p) => ({ nombreBusqueda: { contains: paraBuscar(p) } })) },
      ],
    },
    select: { id: true, nombre: true, prendaId: true, prenda: true, precioVenta: true, codigo: true },
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
    take: 60,
  });
  const vistas = new Map<string, OpcionPromocion>();
  for (const f of filas) {
    if (f.prendaId) {
      if (!vistas.has(`p:${f.prendaId}`)) {
        vistas.set(`p:${f.prendaId}`, { clave: `p:${f.prendaId}`, nombre: f.prenda ?? f.nombre, detalle: `Todas las tallas · ${formatearPesos(f.precioVenta)}` });
      }
    } else {
      vistas.set(`s:${f.id}`, { clave: `s:${f.id}`, nombre: f.nombre, detalle: `${f.codigo} · ${formatearPesos(f.precioVenta)}` });
    }
  }
  // Primero las prendas completas (todas sus tallas), luego los productos sueltos.
  return [...vistas.values()].sort((a, b) => Number(b.clave.startsWith("p:")) - Number(a.clave.startsWith("p:"))).slice(0, 20);
}
