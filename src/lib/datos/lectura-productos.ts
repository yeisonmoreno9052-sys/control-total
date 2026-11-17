// Cargar productos al inventario con fotos (usa el módulo FACTURA_FOTO y su límite).
//
// 1. leerProductosConFoto: la IA mira una tanda de fotos (hasta 10, cuenta como
//    UNA lectura del mes) y propone nombre, categoría, código de barras y, si se
//    ve, precio y cantidad. Cada propuesta se compara con el inventario del
//    negocio para avisar si el producto ya existe.
// 2. La persona revisa en pantalla, pone precio y cantidad.
// 3. guardarProductosDeFotos: crea los nuevos (con su foto) y, en los que ya
//    existían, suma la cantidad al stock y actualiza el precio si lo cambió.
import { Decimal } from "decimal.js";
import { normalizarTexto, parecido } from "@/lib/compras/lectura";
import { tipoDeImagen } from "@/lib/imagenes";
import type { ProductoVisto } from "@/lib/ia/productos";
import type { ArchivoFactura, LectorProductos } from "@/lib/ia/lector";
import { leerCantidad, validarCantidad } from "@/lib/inventario/cantidades";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { tieneModulo } from "@/lib/modulos";
import { exigirGestion } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { guardarCategoria } from "./categorias";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { FOTO_MAXIMO, guardarFotoProducto } from "./fotos-producto";
import { ajustarStock, crearProducto, exigirNegocioPermitido, registrarAuditoria, type Resultado } from "./inventario";
import { anotarLectura, HOJA_MAXIMA, reservarLectura } from "./lectura-factura";
import { obtenerPreferenciasVenta } from "./negocios";

/** Fotos que se leen juntas: cuentan como una sola lectura del mes. */
export const FOTOS_POR_TANDA = 10;
/** Productos que se guardan en una sola llamada (la pantalla los manda por partes). */
export const PRODUCTOS_POR_ENVIO = 10;

export type ProductoExistente = {
  id: string;
  nombre: string;
  precioVenta: number;
  stock: string;
  controlaStock: boolean;
  fraccionado: boolean;
  tieneFoto: boolean;
};

export type ProductoPropuesto = {
  /** Índice de la foto dentro de la tanda (0 = la primera). */
  foto: number;
  nombre: string;
  marca: string | null;
  codigoBarras: string | null;
  /** Precio que se vio en la foto (o null). */
  precio: number | null;
  /** Cantidad que se contó en la foto, como texto para el formulario ("" si no). */
  cantidad: string;
  /** Categoría del negocio que coincide con la sugerida. */
  categoriaId: string | null;
  /** Nombre de una categoría nueva sugerida (cuando ninguna existente sirve). */
  categoriaNueva: string | null;
  /** La foto muestra solo este producto: se usa como foto de su botón. */
  usarFoto: boolean;
  /** Producto del inventario que parece ser el mismo. */
  existente: ProductoExistente | null;
};

const SELECCION_EXISTENTE = {
  id: true,
  nombre: true,
  precioVenta: true,
  stock: true,
  controlaStock: true,
  fraccionado: true,
  fotoEn: true,
} as const;

function aExistente(p: {
  id: string;
  nombre: string;
  precioVenta: number;
  stock: { toString(): string };
  controlaStock: boolean;
  fraccionado: boolean;
  fotoEn: Date | null;
}): ProductoExistente {
  return {
    id: p.id,
    nombre: p.nombre,
    precioVenta: p.precioVenta,
    stock: p.stock.toString(),
    controlaStock: p.controlaStock,
    fraccionado: p.fraccionado,
    tieneFoto: !!p.fotoEn,
  };
}

/** Código de barras leído si parece real (8 a 14 dígitos). */
export function barrasValidas(codigo: string | null | undefined) {
  const limpio = (codigo ?? "").replace(/\s/g, "");
  return /^\d{8,14}$/.test(limpio) ? limpio : null;
}

/** Categoría del negocio que corresponde a la sugerida (mismo nombre o muy parecido). */
export function categoriaParecida(sugerida: string, categorias: { id: string; nombre: string }[]) {
  const buscada = normalizarTexto(sugerida);
  if (!buscada) return null;
  const igual = categorias.find((c) => normalizarTexto(c.nombre) === buscada);
  if (igual) return igual;
  let mejor: { c: { id: string; nombre: string }; puntos: number } | null = null;
  for (const c of categorias) {
    const puntos = parecido(sugerida, c.nombre);
    if (puntos >= 0.5 && (!mejor || puntos > mejor.puntos)) mejor = { c, puntos };
  }
  return mejor?.c ?? null;
}

export async function leerProductosConFoto(
  ctx: Contexto,
  negocioId: string,
  fotos: Uint8Array[],
  lector: LectorProductos | null,
): Promise<Resultado<{ productos: ProductoPropuesto[]; nota: string | null }>> {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  if (!tieneModulo(ctx, "FACTURA_FOTO") || !lector) {
    return { ok: false, error: "La lectura con foto no está activa. Crea los productos a mano." };
  }
  if (!fotos.length) return { ok: false, error: "Toma o elige las fotos de los productos." };
  if (fotos.length > FOTOS_POR_TANDA) return { ok: false, error: `Lee máximo ${FOTOS_POR_TANDA} fotos a la vez.` };
  const archivos: ArchivoFactura[] = [];
  for (const datos of fotos) {
    if (!datos.byteLength) return { ok: false, error: "Una de las fotos está vacía." };
    if (datos.byteLength > HOJA_MAXIMA) return { ok: false, error: "Una de las fotos pesa más de 5 MB. Tómala de nuevo." };
    const tipo = tipoDeImagen(datos);
    if (!tipo) return { ok: false, error: "Solo se pueden leer fotos (JPG, PNG o WEBP)." };
    archivos.push({ tipo: tipo as ArchivoFactura["tipo"], datos });
  }

  const categorias = await datosDe(ctx).categoria.findMany({
    where: { negocioId, activo: true },
    select: { id: true, nombre: true },
    orderBy: { nombre: "asc" },
    take: 200,
  });

  const reserva = await reservarLectura(ctx, negocioId, archivos.length, lector.modelo);
  if (!reserva) return { ok: false, error: "Ya se usaron las lecturas con foto de este mes. Puedes crear los productos a mano." };

  const r = await lector.leerProductos(
    archivos,
    categorias.map((c) => c.nombre),
  );
  const vistos = r.ok ? r.leidos.productos.filter((p) => p.nombre.trim()) : [];
  const error = !r.ok ? r.error : vistos.length ? null : "No vimos productos en estas fotos. Tómalas de nuevo, de cerca y con buena luz.";
  await anotarLectura(reserva.id, r.uso, error);
  if (error || !r.ok) return { ok: false, error: error ?? "No pudimos leer las fotos." };

  const productos: ProductoPropuesto[] = [];
  for (const v of vistos.slice(0, 100)) {
    productos.push(await proponer(ctx, negocioId, v, archivos.length, categorias));
  }
  return { ok: true, productos, nota: r.leidos.nota?.trim().slice(0, 500) || null };
}

async function proponer(
  ctx: Contexto,
  negocioId: string,
  v: ProductoVisto,
  totalFotos: number,
  categorias: { id: string; nombre: string }[],
): Promise<ProductoPropuesto> {
  const nombre = v.nombre.trim().replace(/\s+/g, " ").slice(0, 150);
  const codigoBarras = barrasValidas(v.codigoBarras);
  const foto = Math.min(Math.max(Math.round(v.foto) - 1, 0), totalFotos - 1);
  const cantidad = v.cantidad && v.cantidad > 1 && Number.isInteger(v.cantidad) ? String(Math.min(v.cantidad, 9999)) : "";
  const precio = v.precio && v.precio > 0 && v.precio < 100_000_000 ? Math.round(v.precio) : null;
  const sugerida = v.categoria?.trim().slice(0, 80) || null;
  const categoria = sugerida ? categoriaParecida(sugerida, categorias) : null;
  return {
    foto,
    nombre,
    marca: v.marca?.trim().slice(0, 80) || null,
    codigoBarras,
    precio,
    cantidad,
    categoriaId: categoria?.id ?? null,
    categoriaNueva: categoria ? null : sugerida,
    usarFoto: v.soloEsteProducto,
    existente: await buscarExistente(ctx, negocioId, nombre, codigoBarras),
  };
}

/** El producto del negocio que parece el mismo: por código de barras o por nombre muy parecido. */
async function buscarExistente(ctx: Contexto, negocioId: string, nombre: string, codigoBarras: string | null) {
  const datos = datosDe(ctx);
  if (codigoBarras) {
    const exacto = await datos.producto.findFirst({
      where: { negocioId, activo: true, OR: [{ codigoBarras }, { codigo: codigoBarras }] },
      select: SELECCION_EXISTENTE,
    });
    if (exacto) return aExistente(exacto);
  }
  if (!nombre) return null;
  // Consulta directa por velocidad (trigramas: aguanta "600ml" vs "600 ml").
  // El filtro de empresa y negocio va escrito aquí; el negocio ya se validó.
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Producto"
    WHERE "empresaId" = ${ctx.empresaId} AND "negocioId" = ${negocioId} AND "activo" = true
      AND similarity("nombre", ${nombre}) > 0.45
    ORDER BY similarity("nombre", ${nombre}) DESC, "id"
    LIMIT 1`;
  if (!filas.length) return null;
  const p = await datos.producto.findFirst({ where: { id: filas[0].id }, select: SELECCION_EXISTENTE });
  return p ? aExistente(p) : null;
}

// ─── Guardar lo revisado ────────────────────────────────────────────────────

export type ProductoRevisado = {
  /** Identifica la fila en la pantalla. */
  clave: string;
  /** "crear": producto nuevo. "sumar": suma la cantidad al que ya existe. */
  accion: "crear" | "sumar";
  productoId: string | null;
  nombre: string;
  codigoBarras: string | null;
  categoriaId: string | null;
  categoriaNueva: string | null;
  precioVenta: number;
  costo: number;
  /** Cantidad que hay (crear) o que se suma (sumar). "" = 0. */
  cantidad: string;
};

export type ResultadoGuardado = { clave: string; ok: true; productoId: string } | { clave: string; ok: false; error: string };

/** Siguiente código FOT-0001, FOT-0002… para productos sin código de barras. */
async function ultimoCodigoFoto(negocioId: string) {
  const filas = await prisma.$queryRaw<{ n: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("codigo" FROM 5) AS INTEGER))::int AS n
    FROM "Producto" WHERE "negocioId" = ${negocioId} AND "codigo" ~ '^FOT-[0-9]{1,9}$'`;
  return filas[0]?.n ?? 0;
}

export async function guardarProductosDeFotos(
  ctx: Contexto,
  negocioId: string,
  items: ProductoRevisado[],
  fotos: Map<string, Uint8Array>,
): Promise<ResultadoGuardado[]> {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const lista = items.slice(0, PRODUCTOS_POR_ENVIO * 5);
  const datos = datosDe(ctx);
  const [preferencias, categorias] = await Promise.all([
    obtenerPreferenciasVenta(ctx, negocioId),
    datos.categoria.findMany({ where: { negocioId, activo: true }, select: { id: true, nombre: true } }),
  ]);
  let consecutivo = await ultimoCodigoFoto(negocioId);
  const resultados: ResultadoGuardado[] = [];

  /** Categoría nueva: si ya existe con ese nombre se usa; si no, se crea una sola vez. */
  async function categoriaPara(item: ProductoRevisado): Promise<string | null> {
    if (item.categoriaId) return categorias.some((c) => c.id === item.categoriaId) ? item.categoriaId : null;
    const nombre = item.categoriaNueva?.trim().slice(0, 80);
    if (!nombre) return null;
    const ya = categorias.find((c) => normalizarTexto(c.nombre) === normalizarTexto(nombre));
    if (ya) return ya.id;
    const r = await guardarCategoria(ctx, negocioId, { nombre, margenSugerido: null });
    if (!r.ok) return null;
    categorias.push({ id: r.id, nombre });
    return r.id;
  }

  for (const item of lista) {
    const foto = fotos.get(item.clave) ?? null;
    try {
      const r = item.accion === "sumar" ? await sumarAExistente(ctx, negocioId, item, foto) : await crearNuevo(item, foto);
      resultados.push(r.ok ? { clave: item.clave, ok: true, productoId: r.id } : { clave: item.clave, ok: false, error: r.error });
    } catch (error) {
      console.error("Error guardando producto de foto:", error);
      resultados.push({ clave: item.clave, ok: false, error: "No pudimos guardar este producto. Intenta de nuevo." });
    }
  }
  return resultados;

  async function crearNuevo(item: ProductoRevisado, foto: Uint8Array | null): Promise<Resultado> {
    if (!(item.precioVenta > 0)) return { ok: false, error: "Falta el precio de venta." };
    const errorCantidad = cantidadInvalida(item.cantidad);
    if (errorCantidad) return { ok: false, error: errorCantidad };
    const barras = barrasValidas(item.codigoBarras);
    if (barras) {
      const usado = await datos.producto.findFirst({ where: { negocioId, OR: [{ codigoBarras: barras }, { codigo: barras }] }, select: { id: true } });
      if (usado) return { ok: false, error: "Ese código de barras ya lo tiene otro producto. Elige “Sumar al que ya está”." };
    }
    const entrada = esquemaProducto.safeParse({
      codigo: barras ?? `FOT-${String(consecutivo + 1).padStart(4, "0")}`,
      codigoBarras: barras ?? "",
      nombre: item.nombre,
      descripcion: "",
      categoriaId: (await categoriaPara(item)) ?? "",
      costo: Math.max(0, Math.round(item.costo || 0)),
      precioVenta: Math.round(item.precioVenta),
      stockMinimo: "0",
      unidad: "UNIDAD",
      fraccionado: false,
      porcentajeIva: preferencias.ivaPorDefecto,
      condicion: "NUEVO",
      botonRapido: preferencias.botonesRapidos ? true : undefined,
    });
    if (!entrada.success) return { ok: false, error: entrada.error.issues[0]?.message ?? "Revisa los datos de este producto." };
    if (!barras) consecutivo++;
    let r = await crearProducto(ctx, negocioId, entrada.data, item.cantidad);
    // Otro producto tomó el código FOT mientras tanto: se intenta una vez con el siguiente.
    if (!r.ok && r.campos?.codigo && !barras) {
      consecutivo = Math.max(consecutivo, await ultimoCodigoFoto(negocioId)) + 1;
      r = await crearProducto(ctx, negocioId, { ...entrada.data, codigo: `FOT-${String(consecutivo).padStart(4, "0")}` }, item.cantidad);
    }
    if (!r.ok) return r;
    // Si la foto falla, el producto igual quedó creado.
    if (foto) await guardarFotoProducto(ctx, r.id, foto).catch(() => null);
    return r;
  }
}

/** Mensaje si la cantidad de un producto nuevo no sirve (vacía = 0, vale). */
function cantidadInvalida(texto: string) {
  if (!texto.trim()) return null;
  const cantidad = leerCantidad(texto);
  if (!cantidad || cantidad.isNegative()) return "Revisa la cantidad.";
  if (validarCantidad(cantidad, { fraccionado: false })) return "La cantidad debe ser un número entero.";
  return null;
}

/** Suma la cantidad al producto que ya existía y, si cambió, actualiza su precio de venta. */
async function sumarAExistente(ctx: Contexto, negocioId: string, item: ProductoRevisado, foto: Uint8Array | null): Promise<Resultado> {
  if (!item.productoId) return { ok: false, error: "No encontramos ese producto." };
  const producto = await datosDe(ctx).producto.findFirst({
    where: { id: item.productoId, negocioId, activo: true },
    select: { id: true, codigo: true, precioVenta: true, costo: true, controlaStock: true, fraccionado: true, fotoEn: true },
  });
  if (!producto) return { ok: false, error: "No encontramos ese producto en este negocio." };

  const cantidad = item.cantidad.trim() ? leerCantidad(item.cantidad) : new Decimal(0);
  if (!cantidad || cantidad.isNegative() || validarCantidad(cantidad, { fraccionado: producto.fraccionado })) {
    return { ok: false, error: "Revisa la cantidad que vas a sumar." };
  }
  const precio = Math.round(item.precioVenta);
  const cambiaPrecio = precio > 0 && precio !== producto.precioVenta;
  if (cantidad.isZero() && !cambiaPrecio && (!foto || producto.fotoEn)) {
    return { ok: false, error: "Escribe cuántas unidades vas a sumar." };
  }

  if (!cantidad.isZero()) {
    if (!producto.controlaStock) return { ok: false, error: "Este producto no se cuenta (no controla stock): deja la cantidad vacía." };
    const r = await ajustarStock(ctx, producto.id, {
      modo: "diferencia",
      cantidad: cantidad.toString(),
      motivo: "CONTEO",
      nota: "Cargado con fotos",
    });
    if (!r.ok) return r;
  }
  if (cambiaPrecio) {
    await prisma.$transaction(async (tx) => {
      await tx.producto.update({ where: { id: producto.id }, data: { precioVenta: precio } });
      await registrarAuditoria(tx, ctx, {
        negocioId,
        accion: "CAMBIO_PRECIO",
        entidad: "Producto",
        entidadId: producto.id,
        detalle: {
          codigo: producto.codigo,
          costo: { antes: producto.costo, despues: producto.costo },
          precioVenta: { antes: producto.precioVenta, despues: precio },
        },
      });
    });
  }
  // La foto solo se pone si el producto no tenía: nunca se cambia una que ya escogieron.
  if (foto && !producto.fotoEn) await guardarFotoProducto(ctx, producto.id, foto).catch(() => null);
  return { ok: true, id: producto.id };
}

export { FOTO_MAXIMO };
