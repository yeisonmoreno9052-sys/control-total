// Historial de cambios (auditoría) para administrador y socio.
//
// El administrador ve todo. El socio solo ve lo de sus negocios: los registros
// de toda la empresa (usuarios, logo, bloqueos) no tienen negocio y nombran
// gente de otros locales, así que a él no le salen.
import { exigirGestion } from "@/lib/permisos";
import { describirAuditoria, GRUPOS_HISTORIAL, type Descripcion, type GrupoHistorial } from "@/lib/historial/describir";
import { rangoUtc } from "@/lib/reportes/periodos";
import { AccesoDenegado, datosDe } from "./alcance";
import type { Contexto } from "./contexto";

export const POR_PAGINA = 50;

export type FiltroHistorial = {
  desde: string;
  hasta: string;
  /** null = todos los permitidos. */
  negocioId: string | null;
  usuarioId: string | null;
  grupo: GrupoHistorial | null;
  pagina: number;
};

export type EntradaHistorial = Descripcion & {
  id: string;
  creadoEn: Date;
  accion: string;
  usuario: string;
  negocio: string | null;
};

function condicion(ctx: Contexto, f: Omit<FiltroHistorial, "pagina">) {
  if (f.negocioId && !ctx.negociosPermitidos.includes(f.negocioId)) throw new AccesoDenegado("no tienes acceso a ese negocio");
  const { inicio, fin } = rangoUtc(f.desde, f.hasta);
  const deEmpresa = ctx.rol === "ADMINISTRADOR" && !f.negocioId;
  return {
    creadoEn: { gte: inicio, lt: fin },
    ...(f.negocioId ? { negocioId: f.negocioId } : deEmpresa ? {} : { negocioId: { in: ctx.negociosPermitidos } }),
    ...(f.usuarioId ? { usuarioId: f.usuarioId } : {}),
    ...(f.grupo ? { accion: { in: GRUPOS_HISTORIAL[f.grupo].acciones } } : {}),
  };
}

export async function listarHistorial(ctx: Contexto, f: FiltroHistorial) {
  exigirGestion(ctx);
  const datos = datosDe(ctx);
  const donde = condicion(ctx, f);
  const [registros, total] = await Promise.all([
    datos.auditoria.findMany({
      where: donde,
      select: {
        id: true,
        creadoEn: true,
        accion: true,
        entidad: true,
        entidadId: true,
        detalle: true,
        usuarioId: true,
        negocioId: true,
      },
      orderBy: [{ creadoEn: "desc" }, { id: "desc" }],
      skip: (Math.max(1, f.pagina) - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    datos.auditoria.count({ where: donde }),
  ]);

  const idsUsuarios = [...new Set(registros.map((r) => r.usuarioId))];
  const idsProductos = [...new Set(registros.filter((r) => r.entidad === "Producto" && r.entidadId).map((r) => r.entidadId!))];
  const [usuarios, negocios, productos] = await Promise.all([
    datos.usuario.findMany({ where: { id: { in: idsUsuarios } }, select: { id: true, nombre: true } }),
    datos.negocio.findMany({ select: { id: true, nombre: true } }),
    idsProductos.length
      ? datos.producto.findMany({ where: { id: { in: idsProductos } }, select: { id: true, nombre: true } })
      : [],
  ]);
  const nombre = <T extends { id: string; nombre: string }>(lista: T[], id: string | null) =>
    lista.find((x) => x.id === id)?.nombre ?? null;

  const entradas: EntradaHistorial[] = registros.map((r) => ({
    id: r.id,
    creadoEn: r.creadoEn,
    accion: r.accion,
    usuario: nombre(usuarios, r.usuarioId) ?? "Alguien",
    negocio: nombre(negocios, r.negocioId),
    ...describirAuditoria(r.accion, r.detalle, { producto: r.entidad === "Producto" ? nombre(productos, r.entidadId) : null }),
  }));
  return { entradas, total, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) };
}

/** Personas que aparecen en el historial que este usuario puede ver (para el filtro). */
export async function personasDelHistorial(ctx: Contexto, f: Omit<FiltroHistorial, "pagina" | "usuarioId">) {
  exigirGestion(ctx);
  const datos = datosDe(ctx);
  const grupos = await datos.auditoria.groupBy({ by: ["usuarioId"], where: condicion(ctx, { ...f, usuarioId: null }) });
  if (!grupos.length) return [];
  return datos.usuario.findMany({
    where: { id: { in: grupos.map((g) => g.usuarioId) } },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
  });
}
