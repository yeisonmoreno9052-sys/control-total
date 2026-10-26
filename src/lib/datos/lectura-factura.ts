// Leer facturas de compra con foto (módulo FACTURA_FOTO).
//
// 1. Se reserva la lectura (cuenta para el límite del mes) en una transacción
//    con bloqueo por empresa, así dos lecturas al tiempo no se pasan del límite.
// 2. La IA lee la foto (lib/ia, detrás de una interfaz).
// 3. Cada línea se busca en el inventario del negocio: por código de barras o
//    código (encontrado), por nombre parecido (revisar) o no está (nuevo).
// Aquí no se guarda la factura: la persona revisa y guarda con registrarFactura.
import { diaEnBogota } from "@/lib/formato";
import { cantidadTexto, costoConIva, fechaValida, ivaLeido, mismoNit, parecido, unidadLeida } from "@/lib/compras/lectura";
import { costoEnPesos } from "@/lib/ia/costo";
import type { FacturaLeida } from "@/lib/ia/factura";
import type { ArchivoFactura, LectorFacturas } from "@/lib/ia/lector";
import { tieneModulo } from "@/lib/modulos";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { precioSugerido } from "@/lib/inventario/precios";
import { exigirGestion } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import { productosParaCompra, tipoDeArchivo, type ProductoCompra } from "./compras";
import type { Contexto } from "./contexto";
import { obtenerMargenNegocio } from "./categorias";
import { crearProducto, exigirNegocioPermitido, type Resultado } from "./inventario";
import { obtenerPreferenciasVenta } from "./negocios";

export const HOJAS_POR_FACTURA = 3;
export const HOJA_MAXIMA = 5 * 1024 * 1024;

/** Inicio del mes de Bogotá en UTC: "2026-10-26" → 2026-10-01T05:00Z. */
export function inicioDelMes(dia = diaEnBogota()) {
  return new Date(`${dia.slice(0, 7)}-01T00:00:00-05:00`);
}

/** Cuentan las lecturas que costaron algo y las que están en curso; un error sin costo no cuenta. */
export const cuentaParaLimite = { OR: [{ costoPesos: { gt: 0 } }, { exito: true }, { exito: false, error: null }] };

export type EstadoFotos = { disponible: boolean; usadas: number; limite: number };

/** Si el botón "Leer factura con foto" se muestra y cuántas lecturas quedan este mes. */
export async function estadoFotos(ctx: Contexto, configurado: boolean): Promise<EstadoFotos> {
  if (!tieneModulo(ctx, "FACTURA_FOTO") || !configurado) return { disponible: false, usadas: 0, limite: 0 };
  const [empresa, usadas] = await Promise.all([
    datosDe(ctx).empresa.findFirst({ select: { limiteFotosMes: true } }),
    prisma.lecturaFactura.count({
      where: { empresaId: ctx.empresaId, creadoEn: { gte: inicioDelMes() }, ...cuentaParaLimite },
    }),
  ]);
  return { disponible: true, usadas, limite: empresa?.limiteFotosMes ?? 0 };
}

export type EstadoLinea = "encontrado" | "revisar" | "nuevo";

export type LineaRevisada = {
  descripcion: string;
  codigo: string | null;
  codigoBarras: string | null;
  cantidad: string;
  /** Costo unitario con IVA, en pesos. */
  costo: number;
  /** Como viene en la factura ("MT", "UND"…), para crear el producto si no existe. */
  unidad: string | null;
  porcentajeIva: number | null;
  estado: EstadoLinea;
  /** El producto reconocido (encontrado) o el más parecido (revisar). */
  producto: ProductoCompra | null;
  candidatos: ProductoCompra[];
};

export type FacturaRevisada = {
  proveedor: { id: string | null; nombre: string; nit: string | null; telefono: string | null };
  numero: string;
  fecha: string | null;
  vencimiento: string | null;
  formaPago: FacturaLeida["formaPago"];
  total: number | null;
  nota: string | null;
  lineas: LineaRevisada[];
};

export async function leerFacturaConFoto(
  ctx: Contexto,
  negocioId: string,
  archivos: Uint8Array[],
  lector: LectorFacturas | null,
): Promise<Resultado<{ factura: FacturaRevisada }>> {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  if (!tieneModulo(ctx, "FACTURA_FOTO") || !lector) {
    return { ok: false, error: "La lectura con foto no está activa. Registra la factura a mano." };
  }
  if (!archivos.length) return { ok: false, error: "Toma o elige la foto de la factura." };
  if (archivos.length > HOJAS_POR_FACTURA) {
    return { ok: false, error: `Sube máximo ${HOJAS_POR_FACTURA} fotos por factura.` };
  }
  const hojas: ArchivoFactura[] = [];
  for (const datos of archivos) {
    if (!datos.byteLength) return { ok: false, error: "Una de las fotos está vacía." };
    if (datos.byteLength > HOJA_MAXIMA) return { ok: false, error: "Una de las fotos pesa más de 5 MB. Toma la foto de nuevo." };
    const tipo = tipoDeArchivo(datos);
    if (!tipo) return { ok: false, error: "Solo se pueden leer fotos (JPG, PNG, WEBP) o PDF." };
    hojas.push({ tipo: tipo as ArchivoFactura["tipo"], datos });
  }

  // 1. Reservar la lectura dentro del límite del mes.
  const reserva = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lectura-factura:${ctx.empresaId}`}))`;
    const empresa = await tx.empresa.findUniqueOrThrow({ where: { id: ctx.empresaId }, select: { limiteFotosMes: true } });
    const usadas = await tx.lecturaFactura.count({
      where: { empresaId: ctx.empresaId, creadoEn: { gte: inicioDelMes() }, ...cuentaParaLimite },
    });
    if (usadas >= empresa.limiteFotosMes) return null;
    return tx.lecturaFactura.create({
      data: { empresaId: ctx.empresaId, negocioId, usuarioId: ctx.usuarioId, paginas: hojas.length, modelo: lector.modelo },
      select: { id: true },
    });
  });
  if (!reserva) {
    return { ok: false, error: "Ya se usaron las lecturas con foto de este mes. Puedes registrar la factura a mano." };
  }

  // 2. Leer con la IA y anotar lo que costó.
  const r = await lector.leer(hojas);
  const costoPesos = costoEnPesos(r.uso.modelo, r.uso.tokensEntrada, r.uso.tokensSalida);
  const legible = r.ok && r.factura.legible;
  const error = !r.ok ? r.error : !legible ? "No parece una factura o no se alcanza a leer. Toma la foto de nuevo, con buena luz." : null;
  await prisma.lecturaFactura.update({
    where: { id: reserva.id },
    data: {
      exito: !error,
      error: error ?? undefined,
      modelo: r.uso.modelo,
      tokensEntrada: r.uso.tokensEntrada,
      tokensSalida: r.uso.tokensSalida,
      costoPesos,
    },
  });
  if (error || !r.ok) return { ok: false, error: error ?? "No pudimos leer la factura." };

  // 3. Reconocer proveedor y productos.
  return { ok: true, factura: await revisarFactura(ctx, negocioId, r.factura) };
}

/** Une lo leído con el inventario y los proveedores del negocio. */
export async function revisarFactura(ctx: Contexto, negocioId: string, leida: FacturaLeida): Promise<FacturaRevisada> {
  const hoy = diaEnBogota();
  const fecha = fechaValida(leida.fecha);
  const vencimiento = fechaValida(leida.vencimiento);
  const [proveedorId, lineas] = await Promise.all([
    reconocerProveedor(ctx, negocioId, leida.proveedor),
    Promise.all(leida.lineas.slice(0, 300).map((l) => reconocerLinea(ctx, negocioId, l))),
  ]);
  return {
    proveedor: {
      id: proveedorId,
      nombre: leida.proveedor.nombre.trim().slice(0, 150),
      nit: leida.proveedor.nit?.trim().slice(0, 30) || null,
      telefono: leida.proveedor.telefono?.trim().slice(0, 40) || null,
    },
    numero: (leida.numero ?? "").trim().slice(0, 40),
    fecha: fecha && fecha <= hoy ? fecha : null,
    vencimiento: vencimiento && (!fecha || vencimiento >= fecha) ? vencimiento : null,
    formaPago: leida.formaPago,
    total: leida.total && leida.total > 0 ? Math.round(leida.total) : null,
    nota: leida.nota?.trim().slice(0, 500) || null,
    lineas,
  };
}

async function reconocerProveedor(ctx: Contexto, negocioId: string, p: FacturaLeida["proveedor"]) {
  const proveedores = await datosDe(ctx).proveedor.findMany({
    where: { negocioId, activo: true },
    select: { id: true, nombre: true, nit: true },
    take: 1000,
  });
  const porNit = proveedores.find((x) => mismoNit(x.nit, p.nit));
  if (porNit) return porNit.id;
  let mejor: { id: string; puntos: number } | null = null;
  for (const x of proveedores) {
    const puntos = parecido(p.nombre, x.nombre);
    if (puntos >= 0.6 && (!mejor || puntos > mejor.puntos)) mejor = { id: x.id, puntos };
  }
  return mejor?.id ?? null;
}

async function reconocerLinea(ctx: Contexto, negocioId: string, l: FacturaLeida["lineas"][number]): Promise<LineaRevisada> {
  const base = {
    descripcion: l.descripcion.trim().slice(0, 150),
    codigo: l.codigo?.trim().slice(0, 50) || null,
    codigoBarras: l.codigoBarras?.replace(/\s/g, "").slice(0, 60) || null,
    cantidad: cantidadTexto(l.cantidad),
    costo: costoConIva(l),
    unidad: l.unidad?.trim().slice(0, 20) || null,
    porcentajeIva: l.porcentajeIva,
  };
  const datos = datosDe(ctx);
  const codigos = [base.codigoBarras, base.codigo].filter((c): c is string => !!c);
  if (codigos.length) {
    const exacto = await datos.producto.findFirst({
      where: {
        negocioId,
        activo: true,
        OR: codigos.flatMap((c) => [{ codigoBarras: c }, { codigo: { equals: c, mode: "insensitive" as const } }]),
      },
      select: { id: true },
    });
    if (exacto) {
      const [producto] = await productosParaCompra(ctx, negocioId, [exacto.id]);
      return { ...base, estado: "encontrado", producto, candidatos: [] };
    }
  }
  const candidatos = base.descripcion ? await parecidos(ctx, negocioId, base.descripcion) : [];
  return candidatos.length
    ? { ...base, estado: "revisar", producto: candidatos[0], candidatos }
    : { ...base, estado: "nuevo", producto: null, candidatos: [] };
}

/** Hasta 3 productos con nombre parecido (trigramas: aguanta abreviaturas y errores de lectura). */
async function parecidos(ctx: Contexto, negocioId: string, nombre: string) {
  // Consulta directa por velocidad: el filtro de empresa y negocio va escrito aquí,
  // y el negocio ya se validó contra los permitidos del usuario.
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Producto"
    WHERE "empresaId" = ${ctx.empresaId} AND "negocioId" = ${negocioId} AND "activo" = true
      AND similarity("nombre", ${nombre}) > 0.2
    ORDER BY similarity("nombre", ${nombre}) DESC, "id"
    LIMIT 3`;
  if (!filas.length) return [];
  const productos = await productosParaCompra(ctx, negocioId, filas.map((f) => f.id));
  const porId = new Map(productos.map((p) => [p.id, p]));
  return filas.map((f) => porId.get(f.id)).filter((p): p is ProductoCompra => !!p);
}

// ─── Crear de una vez los productos que no estaban ──────────────────────────

export type ProductoLeido = {
  clave: string;
  descripcion: string;
  codigo: string | null;
  codigoBarras: string | null;
  unidad: string | null;
  porcentajeIva: number | null;
  /** Costo con IVA, en pesos. */
  costo: number;
};

/** Siguiente código FAC-0001, FAC-0002… para productos que llegan sin código en la factura. */
async function ultimoCodigoFactura(negocioId: string) {
  const filas = await prisma.$queryRaw<{ n: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING("codigo" FROM 5) AS INTEGER))::int AS n
    FROM "Producto" WHERE "negocioId" = ${negocioId} AND "codigo" ~ '^FAC-[0-9]{1,9}$'`;
  return filas[0]?.n ?? 0;
}

/**
 * Crea en el inventario, con stock 0, los productos de la foto que no existían.
 * Precio de venta = el sugerido por el margen del negocio. Si el código de la
 * factura ya lo usa otro producto, se le pone uno nuevo (FAC-0001…).
 * Devuelve los creados (para agregarlos a la factura) y los que no se pudieron.
 */
export async function crearProductosLeidos(ctx: Contexto, negocioId: string, items: ProductoLeido[]) {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const lista = items.slice(0, 300);
  const datos = datosDe(ctx);
  const [margen, preferencias, usados] = await Promise.all([
    obtenerMargenNegocio(ctx, negocioId),
    obtenerPreferenciasVenta(ctx, negocioId),
    datos.producto.findMany({
      where: {
        negocioId,
        OR: [
          { codigo: { in: lista.flatMap((i) => [i.codigo, i.codigoBarras]).filter((c): c is string => !!c), mode: "insensitive" } },
          { codigoBarras: { in: lista.map((i) => i.codigoBarras).filter((c): c is string => !!c) } },
        ],
      },
      select: { codigo: true, codigoBarras: true },
    }),
  ]);
  const codigosUsados = new Set(usados.map((u) => u.codigo.toLowerCase()));
  const barrasUsadas = new Set(usados.map((u) => u.codigoBarras).filter(Boolean));
  let consecutivo = await ultimoCodigoFactura(negocioId);
  const siguiente = () => `FAC-${String(++consecutivo).padStart(4, "0")}`;

  const creados: { clave: string; producto: ProductoCompra }[] = [];
  const fallidos: { clave: string; descripcion: string; error: string }[] = [];
  for (const item of lista) {
    const barras = item.codigoBarras && !barrasUsadas.has(item.codigoBarras) ? item.codigoBarras : null;
    const propio = item.codigo || barras;
    let codigo = propio && !codigosUsados.has(propio.toLowerCase()) ? propio : siguiente();
    const unidad = unidadLeida(item.unidad);
    const entrada = esquemaProducto.safeParse({
      codigo,
      codigoBarras: barras ?? "",
      nombre: item.descripcion || "Producto de factura",
      descripcion: "",
      costo: item.costo,
      precioVenta: precioSugerido(item.costo, margen),
      stockMinimo: "0",
      unidad,
      fraccionado: unidad !== "UNIDAD",
      porcentajeIva: ivaLeido(item.porcentajeIva, preferencias.ivaPorDefecto),
      condicion: "NUEVO",
    });
    if (!entrada.success) {
      fallidos.push({ clave: item.clave, descripcion: item.descripcion, error: "Faltan datos; créalo a mano." });
      continue;
    }
    let r = await crearProducto(ctx, negocioId, entrada.data, "0");
    // Otro producto tomó el código mientras tanto: se intenta una vez con uno nuevo.
    if (!r.ok && r.campos?.codigo) {
      codigo = siguiente();
      r = await crearProducto(ctx, negocioId, { ...entrada.data, codigo }, "0");
    }
    if (!r.ok) {
      fallidos.push({ clave: item.clave, descripcion: item.descripcion, error: r.error });
      continue;
    }
    codigosUsados.add(codigo.toLowerCase());
    if (barras) barrasUsadas.add(barras);
    const [producto] = await productosParaCompra(ctx, negocioId, [r.id]);
    creados.push({ clave: item.clave, producto });
  }
  return { creados, fallidos };
}
