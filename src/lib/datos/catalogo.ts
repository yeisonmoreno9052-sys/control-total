// Catálogo en línea, lado del negocio: prenderlo, escoger el link, ver qué miran y qué
// piden los clientes y a quién avisarle cuando llega una talla.
import { z } from "zod";
import { errorSlug, numeroWhatsapp, sugerirSlug } from "@/lib/catalogo/catalogo";
import { fechaDeHoy } from "@/lib/formato";
import { exigirGestion } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, registrarAuditoria, type Resultado } from "./inventario";

export type ConfigCatalogo = {
  activo: boolean;
  slug: string;
  whatsapp: string;
  mostrarCantidad: boolean;
  /** Teléfono del negocio, que se usa si no se escribe otro WhatsApp. */
  telefonoNegocio: string | null;
  nombreNegocio: string;
};

export async function obtenerConfigCatalogo(ctx: Contexto, negocioId: string): Promise<ConfigCatalogo | null> {
  exigirNegocioPermitido(ctx, negocioId);
  const n = await datosDe(ctx).negocio.findFirst({
    where: { id: negocioId },
    select: { nombre: true, telefono: true, catalogoActivo: true, catalogoSlug: true, catalogoWhatsapp: true, catalogoMostrarCantidad: true },
  });
  if (!n) return null;
  return {
    activo: n.catalogoActivo,
    slug: n.catalogoSlug ?? sugerirSlug(n.nombre),
    whatsapp: n.catalogoWhatsapp ?? "",
    mostrarCantidad: n.catalogoMostrarCantidad,
    telefonoNegocio: n.telefono,
    nombreNegocio: n.nombre,
  };
}

/** El link del catálogo si está prendido ("dbshop"), para los Estados y los avisos. */
export async function slugCatalogo(ctx: Contexto, negocioId: string): Promise<string | null> {
  if (!ctx.negociosPermitidos.includes(negocioId)) return null;
  const n = await datosDe(ctx).negocio.findFirst({ where: { id: negocioId }, select: { catalogoActivo: true, catalogoSlug: true } });
  return n?.catalogoActivo && n.catalogoSlug ? n.catalogoSlug : null;
}

export const esquemaConfigCatalogo = z.object({
  activo: z.boolean(),
  slug: z.string().trim().toLowerCase().max(60),
  whatsapp: z.string().trim().max(30).default(""),
  mostrarCantidad: z.boolean().default(false),
});

export async function guardarConfigCatalogo(ctx: Contexto, negocioId: string, entrada: unknown): Promise<Resultado> {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const r = esquemaConfigCatalogo.safeParse(entrada);
  if (!r.success) return { ok: false, error: "Revisa los datos." };
  const d = r.data;
  const campos: Record<string, string> = {};
  const errSlug = errorSlug(d.slug);
  if (errSlug) campos.slug = errSlug;
  if (d.whatsapp && !numeroWhatsapp(d.whatsapp)) campos.whatsapp = "Ese número no parece un celular. Escríbelo así: 300 123 4567.";
  const antes = await datosDe(ctx).negocio.findFirst({
    where: { id: negocioId },
    select: { nombre: true, telefono: true, catalogoActivo: true, catalogoSlug: true, catalogoWhatsapp: true, catalogoMostrarCantidad: true },
  });
  if (!antes) return { ok: false, error: "No encontramos ese negocio." };
  if (d.activo && !d.whatsapp && !numeroWhatsapp(antes.telefono)) {
    campos.whatsapp = "Escribe el número de WhatsApp que recibe los pedidos.";
  }
  if (!campos.slug) {
    // El link es único en todo el sistema (entre todas las empresas).
    const ocupado = await prisma.negocio.findFirst({ where: { catalogoSlug: d.slug, id: { not: negocioId } }, select: { id: true } });
    if (ocupado) campos.slug = "Ese link ya lo tiene otra tienda. Prueba con otro.";
  }
  if (Object.keys(campos).length) return { ok: false, error: "Revisa los campos marcados.", campos };

  const nuevo = {
    catalogoActivo: d.activo,
    catalogoSlug: d.slug,
    catalogoWhatsapp: d.whatsapp || null,
    catalogoMostrarCantidad: d.mostrarCantidad,
  };
  await prisma.$transaction(async (tx) => {
    await tx.negocio.update({ where: { id: negocioId }, data: nuevo });
    const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
    for (const [k, v] of Object.entries(nuevo)) {
      const previo = antes[k as keyof typeof antes];
      if (previo !== v) cambios[k] = { antes: previo, despues: v };
    }
    if (Object.keys(cambios).length) {
      await registrarAuditoria(tx, ctx, {
        negocioId,
        accion: "CAMBIO_DATOS_NEGOCIO",
        entidad: "Negocio",
        entidadId: negocioId,
        detalle: { negocio: antes.nombre, cambios },
      });
    }
  });
  return { ok: true, id: negocioId };
}

export type FilaEstadistica = { clave: string; nombre: string; vistas: number; pedidos: number };

/** Qué miran y qué piden: las prendas con más vistas y más pedidos de los últimos días. */
export async function estadisticasCatalogo(ctx: Contexto, negocioId: string, dias = 30) {
  exigirNegocioPermitido(ctx, negocioId);
  const desde = new Date(fechaDeHoy().getTime() - (dias - 1) * 86_400_000);
  const filas = await datosDe(ctx).vistaCatalogo.findMany({
    where: { negocioId, dia: { gte: desde } },
    select: { clave: true, nombre: true, vistas: true, pedidos: true },
    take: 20_000,
  });
  const porClave = new Map<string, FilaEstadistica>();
  let vistas = 0;
  let pedidos = 0;
  for (const f of filas) {
    vistas += f.vistas;
    pedidos += f.pedidos;
    const x = porClave.get(f.clave);
    if (x) {
      x.vistas += f.vistas;
      x.pedidos += f.pedidos;
      x.nombre = f.nombre;
    } else porClave.set(f.clave, { clave: f.clave, nombre: f.nombre, vistas: f.vistas, pedidos: f.pedidos });
  }
  const todas = [...porClave.values()];
  return {
    dias,
    vistas,
    pedidos,
    masVistas: [...todas].sort((a, b) => b.vistas - a.vistas || b.pedidos - a.pedidos).filter((x) => x.vistas > 0).slice(0, 10),
    masPedidas: [...todas].sort((a, b) => b.pedidos - a.pedidos || b.vistas - a.vistas).filter((x) => x.pedidos > 0).slice(0, 10),
  };
}

export type AvisoVista = {
  id: string;
  clave: string;
  nombre: string;
  talla: string | null;
  color: string | null;
  cliente: string | null;
  telefono: string;
  creadoEn: Date;
  /** Ya hay unidades de esa talla y color. */
  llego: boolean;
};

/**
 * Clientes esperando una talla. Con prendaId, solo los de esa prenda. Dice cuáles ya se
 * pueden avisar (hay stock de esa talla y color).
 */
export async function avisosPendientes(ctx: Contexto, negocioId: string, prendaId?: string): Promise<AvisoVista[]> {
  exigirNegocioPermitido(ctx, negocioId);
  const datos = datosDe(ctx);
  const avisos = await datos.avisoTalla.findMany({
    where: { negocioId, avisadoEn: null, ...(prendaId ? { OR: [{ prendaId }, { productoId: prendaId }] } : {}) },
    select: { id: true, prendaId: true, productoId: true, nombre: true, talla: true, color: true, cliente: true, telefono: true, creadoEn: true },
    orderBy: { creadoEn: "asc" },
    take: 300,
  });
  if (!avisos.length) return [];
  const prendas = [...new Set(avisos.map((a) => a.prendaId).filter((x): x is string => !!x))];
  const sueltos = [...new Set(avisos.map((a) => a.productoId).filter((x): x is string => !!x))];
  const conStock = await datos.producto.findMany({
    where: { negocioId, activo: true, stock: { gt: 0 }, OR: [{ prendaId: { in: prendas } }, { id: { in: sueltos } }] },
    select: { id: true, prendaId: true, talla: true, color: true },
  });
  const igual = (a: string | null, b: string | null) => !a || (b ?? "").toLowerCase() === a.toLowerCase();
  return avisos.map((a) => ({
    id: a.id,
    clave: a.prendaId ?? a.productoId ?? "",
    nombre: a.nombre,
    talla: a.talla,
    color: a.color,
    cliente: a.cliente,
    telefono: a.telefono,
    creadoEn: a.creadoEn,
    llego: conStock.some((p) =>
      a.prendaId ? p.prendaId === a.prendaId && igual(a.talla, p.talla) && igual(a.color, p.color) : p.id === a.productoId,
    ),
  }));
}

/** Se le escribió al cliente (o ya no hace falta): sale de la lista. */
export async function marcarAvisado(ctx: Contexto, avisoId: string): Promise<Resultado> {
  const datos = datosDe(ctx);
  const aviso = await datos.avisoTalla.findFirst({ where: { id: String(avisoId).slice(0, 40), avisadoEn: null }, select: { id: true } });
  if (!aviso) return { ok: false, error: "Ese aviso ya no está en la lista." };
  await datos.avisoTalla.update({ where: { id: aviso.id }, data: { avisadoEn: new Date() } });
  return { ok: true, id: aviso.id };
}
