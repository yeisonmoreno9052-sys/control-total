import { exigirGestion } from "@/lib/permisos";
import { datosDe } from "./alcance";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, mensajeDeError, type Resultado } from "./inventario";

export type CategoriaVista = {
  id: string;
  nombre: string;
  margenSugerido: number | null;
  activo: boolean;
  productos: number;
};

/** Categorías del negocio con cuántos productos activos tiene cada una. */
export async function listarCategorias(
  ctx: Contexto,
  negocioId: string,
  opciones: { incluirInactivas?: boolean } = {},
): Promise<CategoriaVista[]> {
  const datos = datosDe(ctx);
  const [categorias, conteos] = await Promise.all([
    datos.categoria.findMany({
      where: { negocioId, ...(opciones.incluirInactivas ? {} : { activo: true }) },
      select: { id: true, nombre: true, margenSugerido: true, activo: true },
      orderBy: { nombre: "asc" },
    }),
    datos.producto.groupBy({
      by: ["categoriaId"],
      where: { negocioId, activo: true },
      _count: { _all: true },
    }),
  ]);
  const porCategoria = new Map(conteos.map((c) => [c.categoriaId, c._count._all]));
  return categorias.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    margenSugerido: c.margenSugerido === null ? null : Number(c.margenSugerido),
    activo: c.activo,
    productos: porCategoria.get(c.id) ?? 0,
  }));
}

/** Margen por defecto del negocio, en %. */
export async function obtenerMargenNegocio(ctx: Contexto, negocioId: string) {
  const negocio = await datosDe(ctx).negocio.findFirst({
    where: { id: negocioId },
    select: { margenSugerido: true },
  });
  return negocio ? Number(negocio.margenSugerido) : 0;
}

export async function guardarMargenNegocio(ctx: Contexto, negocioId: string, margen: number): Promise<Resultado> {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  await datosDe(ctx).negocio.update({ where: { id: negocioId }, data: { margenSugerido: margen } });
  return { ok: true, id: negocioId };
}

export async function guardarCategoria(
  ctx: Contexto,
  negocioId: string,
  datos: { id?: string; nombre: string; margenSugerido: number | null; activo?: boolean },
): Promise<Resultado> {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const tabla = datosDe(ctx).categoria;
  try {
    if (datos.id) {
      const { count } = await tabla.updateMany({
        where: { id: datos.id, negocioId },
        data: {
          nombre: datos.nombre,
          margenSugerido: datos.margenSugerido,
          ...(datos.activo === undefined ? {} : { activo: datos.activo }),
        },
      });
      return count ? { ok: true, id: datos.id } : { ok: false, error: "No encontramos esa categoría." };
    }
    const creada = await tabla.create({
      data: { empresaId: ctx.empresaId, negocioId, nombre: datos.nombre, margenSugerido: datos.margenSugerido },
      select: { id: true },
    });
    return { ok: true, id: creada.id };
  } catch (error) {
    const mensaje = mensajeDeError(error);
    if (mensaje) return { ok: false, ...mensaje };
    throw error;
  }
}

/**
 * Pasa varios productos a una categoría de una vez (o los deja sin categoría con null).
 * Sirve para ordenar lo que entró "sin categoría" desde una factura o una importación.
 */
export async function asignarCategoria(
  ctx: Contexto,
  negocioId: string,
  productoIds: string[],
  categoriaId: string | null,
): Promise<Resultado<{ cambiados: number }>> {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const ids = [...new Set(productoIds)].slice(0, 500);
  if (!ids.length) return { ok: false, error: "Marca al menos un producto." };
  const datos = datosDe(ctx);
  if (categoriaId) {
    const categoria = await datos.categoria.findFirst({ where: { id: categoriaId, negocioId, activo: true }, select: { id: true } });
    if (!categoria) return { ok: false, error: "Esa categoría no existe en este negocio." };
  }
  const { count } = await datos.producto.updateMany({ where: { id: { in: ids }, negocioId }, data: { categoriaId } });
  return { ok: true, cambiados: count };
}
