// Importación masiva de productos desde Excel (.xlsx) o CSV.
//
// Se hace en dos pasos con el mismo archivo:
//   1. analizarImportacion(): lee, valida cada fila y arma la vista previa.
//   2. ejecutarImportacion(): vuelve a analizar y, solo si no hay errores, guarda
//      todo en una sola transacción (o se guarda todo, o nada).
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { Decimal, leerCantidad, MENSAJES_CANTIDAD, validarCantidad } from "@/lib/inventario/cantidades";
import { esquemaProducto, leerPesos } from "@/lib/inventario/esquemas";
import { precioSugerido } from "@/lib/inventario/precios";
import { exigirGestion } from "@/lib/permisos";
import { datosDe } from "./alcance";
import { prisma } from "./cliente";
import type { Contexto } from "./contexto";
import { exigirNegocioPermitido, registrarMovimiento } from "./inventario";

export const MAX_FILAS = 50_000;
export const MAX_BYTES = 15 * 1024 * 1024;

/** Columnas de la plantilla, en orden. */
export const COLUMNAS = [
  { clave: "codigo", titulo: "Código", ejemplo: "TOR-1/4-2", nota: "Obligatorio. Único en el negocio." },
  { clave: "codigoBarras", titulo: "Código de barras", ejemplo: "7701234567890", nota: "Opcional." },
  { clave: "nombre", titulo: "Nombre", ejemplo: "Tornillo 1/4 x 2 pulgadas", nota: "Obligatorio." },
  { clave: "categoria", titulo: "Categoría", ejemplo: "Tornillería", nota: "Si no existe, se crea." },
  { clave: "costo", titulo: "Costo", ejemplo: "250", nota: "En pesos, sin decimales." },
  { clave: "precioVenta", titulo: "Precio de venta", ejemplo: "400", nota: "Si lo dejas vacío, se calcula con el margen." },
  { clave: "stock", titulo: "Stock", ejemplo: "500", nota: "Cantidad actual. Vacío = no cambia." },
  { clave: "stockMinimo", titulo: "Stock mínimo", ejemplo: "100", nota: "Para el aviso de stock bajo." },
  { clave: "unidad", titulo: "Unidad", ejemplo: "unidad", nota: "unidad, metro, centímetro, kilo, gramo, libra, litro o galón." },
  { clave: "fraccionado", titulo: "Venta fraccionada", ejemplo: "no", nota: "sí o no (ej. cable por metros: sí)." },
  { clave: "iva", titulo: "IVA %", ejemplo: "19", nota: "0, 5 o 19." },
  { clave: "condicion", titulo: "Condición", ejemplo: "nuevo", nota: "nuevo o segunda." },
] as const;

type Clave = (typeof COLUMNAS)[number]["clave"];

// Nombres alternativos que aceptamos en el encabezado (de otros programas o escritos a mano).
const ALIAS: Record<string, Clave> = {
  codigo: "codigo", referencia: "codigo", ref: "codigo", "codigo interno": "codigo", sku: "codigo",
  "codigo de barras": "codigoBarras", "cod barras": "codigoBarras", barras: "codigoBarras", ean: "codigoBarras",
  nombre: "nombre", descripcion: "nombre", producto: "nombre", articulo: "nombre",
  categoria: "categoria", departamento: "categoria", linea: "categoria",
  costo: "costo", "precio de costo": "costo", "precio costo": "costo", "costo unitario": "costo",
  "precio de venta": "precioVenta", "precio venta": "precioVenta", precio: "precioVenta", "precio publico": "precioVenta",
  stock: "stock", existencia: "stock", existencias: "stock", cantidad: "stock", inventario: "stock",
  "stock minimo": "stockMinimo", minimo: "stockMinimo", "inv minimo": "stockMinimo", "inventario minimo": "stockMinimo",
  unidad: "unidad", "unidad de medida": "unidad", medida: "unidad",
  "venta fraccionada": "fraccionado", fraccionado: "fraccionado", granel: "fraccionado",
  iva: "iva", "iva %": "iva", impuesto: "iva", "% iva": "iva",
  condicion: "condicion", estado: "condicion",
};

const UNIDADES_TEXTO: Record<string, string> = {
  "": "UNIDAD", unidad: "UNIDAD", und: "UNIDAD", un: "UNIDAD", u: "UNIDAD", pieza: "UNIDAD", pza: "UNIDAD",
  metro: "METRO", metros: "METRO", m: "METRO", mt: "METRO", mts: "METRO",
  centimetro: "CENTIMETRO", centimetros: "CENTIMETRO", cm: "CENTIMETRO",
  kilo: "KILO", kilos: "KILO", kg: "KILO", kilogramo: "KILO",
  gramo: "GRAMO", gramos: "GRAMO", g: "GRAMO", gr: "GRAMO",
  libra: "LIBRA", libras: "LIBRA", lb: "LIBRA",
  litro: "LITRO", litros: "LITRO", l: "LITRO", lt: "LITRO",
  galon: "GALON", galones: "GALON", gal: "GALON",
};

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.:_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type FilaCruda = { numero: number; valores: Partial<Record<Clave, string>> };

function celdaATexto(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  // Números de Excel con decimales → coma decimal, como se escriben en Colombia.
  if (typeof valor === "number") return String(valor).replace(".", ",");
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "boolean") return valor ? "si" : "no";
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "object") {
    if ("result" in valor && valor.result !== undefined) return celdaATexto(valor.result as ExcelJS.CellValue);
    if ("text" in valor) return String(valor.text).trim();
    if ("richText" in valor) return valor.richText.map((r) => r.text).join("").trim();
  }
  return String(valor).trim();
}

function mapearEncabezado(encabezados: string[]) {
  const mapa = new Map<number, Clave>();
  encabezados.forEach((e, i) => {
    const clave = ALIAS[normalizar(e)];
    if (clave && ![...mapa.values()].includes(clave)) mapa.set(i, clave);
  });
  return mapa;
}

async function leerFilas(archivo: Uint8Array, nombreArchivo: string): Promise<FilaCruda[] | { error: string }> {
  let tabla: string[][];
  if (/\.xlsx$/i.test(nombreArchivo)) {
    const libro = new ExcelJS.Workbook();
    try {
      await libro.xlsx.load(archivo.buffer.slice(archivo.byteOffset, archivo.byteOffset + archivo.byteLength) as ArrayBuffer);
    } catch {
      return { error: "No pudimos abrir el archivo de Excel. Revisa que sea .xlsx y no esté dañado." };
    }
    const hoja = libro.worksheets[0];
    if (!hoja) return { error: "El archivo de Excel no tiene hojas." };
    tabla = [];
    hoja.eachRow({ includeEmpty: true }, (fila, numero) => {
      const valores = (fila.values as ExcelJS.CellValue[]).slice(1).map(celdaATexto);
      tabla[numero - 1] = valores;
    });
    for (let i = 0; i < tabla.length; i++) tabla[i] ??= [];
  } else if (/\.(csv|txt)$/i.test(nombreArchivo)) {
    let texto = new TextDecoder("utf-8").decode(archivo);
    if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(archivo);
    const resultado = Papa.parse<string[]>(texto.replace(/^﻿/, ""), { skipEmptyLines: false });
    tabla = resultado.data.map((f) => f.map((c) => (c ?? "").trim()));
  } else {
    return { error: "Sube un archivo de Excel (.xlsx) o CSV (.csv)." };
  }

  const indiceEncabezado = tabla.findIndex((f) => f.some((c) => c));
  if (indiceEncabezado < 0) return { error: "El archivo está vacío." };
  const mapa = mapearEncabezado(tabla[indiceEncabezado]);
  const claves = new Set(mapa.values());
  const faltan = (["codigo", "nombre"] as const).filter((c) => !claves.has(c));
  if (faltan.length) {
    return {
      error: `No encontramos la columna ${faltan.map((c) => `"${COLUMNAS.find((k) => k.clave === c)!.titulo}"`).join(" ni ")} en la primera fila. Usa la plantilla.`,
    };
  }

  const filas: FilaCruda[] = [];
  for (let i = indiceEncabezado + 1; i < tabla.length; i++) {
    const celdas = tabla[i] ?? [];
    if (!celdas.some((c) => c)) continue;
    const valores: Partial<Record<Clave, string>> = {};
    mapa.forEach((clave, col) => {
      valores[clave] = celdas[col] ?? "";
    });
    filas.push({ numero: i + 1, valores });
  }
  if (filas.length > MAX_FILAS) return { error: `El archivo tiene más de ${MAX_FILAS.toLocaleString("es-CO")} productos. Divídelo en partes.` };
  if (!filas.length) return { error: "El archivo no tiene productos debajo del encabezado." };
  return filas;
}

type ProductoImportado = {
  fila: number;
  codigo: string;
  existenteId: string | null;
  categoria: string | null;
  datos: {
    codigoBarras?: string | null;
    nombre: string;
    costo?: number;
    precioVenta?: number;
    stockMinimo?: string;
    unidad?: string;
    fraccionado?: boolean;
    porcentajeIva?: number;
    condicion?: string;
  };
  stock: Decimal | null;
};

export type ErrorFila = { fila: number; mensaje: string };

export type AnalisisImportacion = {
  ok: boolean;
  error?: string;
  total: number;
  nuevos: number;
  actualizados: number;
  categoriasNuevas: string[];
  errores: ErrorFila[];
  muestra: { fila: number; codigo: string; nombre: string; precioVenta: number | null; stock: string | null; accion: "nuevo" | "actualizar" }[];
};

function vacio(error: string): AnalisisImportacion {
  return { ok: false, error, total: 0, nuevos: 0, actualizados: 0, categoriasNuevas: [], errores: [], muestra: [] };
}

async function analizar(ctx: Contexto, negocioId: string, archivo: Uint8Array, nombreArchivo: string) {
  if (archivo.byteLength > MAX_BYTES) return { analisis: vacio("El archivo pesa más de 15 MB."), productos: [] };
  const filas = await leerFilas(archivo, nombreArchivo);
  if ("error" in filas) return { analisis: vacio(filas.error), productos: [] };

  const datos = datosDe(ctx);
  const [existentes, categorias, negocio] = await Promise.all([
    datos.producto.findMany({
      where: { negocioId },
      select: {
        id: true,
        codigo: true,
        codigoBarras: true,
        nombre: true,
        costo: true,
        precioVenta: true,
        fraccionado: true,
        unidad: true,
        stockMinimo: true,
        porcentajeIva: true,
        condicion: true,
      },
    }),
    datos.categoria.findMany({ where: { negocioId }, select: { id: true, nombre: true, margenSugerido: true } }),
    datos.negocio.findFirst({ where: { id: negocioId }, select: { margenSugerido: true } }),
  ]);
  const porCodigo = new Map(existentes.map((p) => [p.codigo.toLowerCase(), p]));
  const barrasEnUso = new Map(existentes.filter((p) => p.codigoBarras).map((p) => [p.codigoBarras!, p.codigo.toLowerCase()]));
  const categoriasPorNombre = new Map(categorias.map((c) => [normalizar(c.nombre), c]));
  const margenNegocio = Number(negocio?.margenSugerido ?? 0);

  const errores: ErrorFila[] = [];
  const productos: ProductoImportado[] = [];
  const codigosVistos = new Map<string, number>();
  const barrasVistas = new Map<string, number>();
  const categoriasNuevas = new Map<string, string>();

  for (const { numero, valores: v } of filas) {
    const errorFila = (mensaje: string) => errores.push({ fila: numero, mensaje });
    const codigo = (v.codigo ?? "").trim();
    if (!codigo) {
      errorFila("Falta el código.");
      continue;
    }
    const clave = codigo.toLowerCase();
    if (codigosVistos.has(clave)) {
      errorFila(`El código "${codigo}" está repetido (también en la fila ${codigosVistos.get(clave)}).`);
      continue;
    }
    codigosVistos.set(clave, numero);
    const existente = porCodigo.get(clave) ?? null;

    // Unidad, condición y fraccionado escritos a mano → valores del sistema.
    const unidadTexto = normalizar(v.unidad ?? "");
    const unidad = v.unidad === undefined || (existente && !unidadTexto) ? existente?.unidad ?? "UNIDAD" : UNIDADES_TEXTO[unidadTexto];
    if (!unidad) {
      errorFila(`No reconocemos la unidad "${v.unidad}". Usa unidad, metro, kilo, gramo, libra, litro o galón.`);
      continue;
    }
    const condicionTexto = normalizar(v.condicion ?? "");
    const condicion = !condicionTexto
      ? existente?.condicion ?? "NUEVO"
      : condicionTexto.startsWith("seg") || condicionTexto.includes("usad") || condicionTexto === "de segunda"
        ? "DE_SEGUNDA"
        : condicionTexto.startsWith("nuev")
          ? "NUEVO"
          : null;
    if (!condicion) {
      errorFila(`No reconocemos la condición "${v.condicion}". Usa nuevo o segunda.`);
      continue;
    }
    const fraccionadoTexto = normalizar(v.fraccionado ?? "");
    const fraccionado = fraccionadoTexto
      ? ["si", "s", "x", "1", "true"].includes(fraccionadoTexto)
      : (existente?.fraccionado ?? false);

    const categoriaNombre = (v.categoria ?? "").trim();
    let margenCategoria: number | null = null;
    if (categoriaNombre) {
      const encontrada = categoriasPorNombre.get(normalizar(categoriaNombre));
      if (encontrada) {
        margenCategoria = encontrada.margenSugerido === null ? null : Number(encontrada.margenSugerido);
      } else {
        categoriasNuevas.set(normalizar(categoriaNombre), categoriaNombre);
      }
    }

    const costoTexto = (v.costo ?? "").trim();
    const costo = costoTexto ? leerPesos(costoTexto) : existente?.costo ?? 0;
    if (costo === null || costo < 0) {
      errorFila(`El costo "${v.costo}" no es un valor válido.`);
      continue;
    }
    const precioTexto = (v.precioVenta ?? "").trim();
    let precioVenta = precioTexto ? leerPesos(precioTexto) : existente?.precioVenta ?? null;
    if (precioTexto && (precioVenta === null || precioVenta <= 0)) {
      errorFila(`El precio de venta "${v.precioVenta}" no es un valor válido.`);
      continue;
    }
    if (!precioVenta) {
      if (costo > 0) precioVenta = precioSugerido(costo, margenCategoria ?? margenNegocio);
      else {
        errorFila("Falta el precio de venta (o el costo, para calcularlo con el margen).");
        continue;
      }
    }

    const ivaTexto = (v.iva ?? "").replace("%", "").trim();
    const entrada = {
      codigo,
      codigoBarras: v.codigoBarras !== undefined ? v.codigoBarras : existente?.codigoBarras ?? "",
      nombre: (v.nombre ?? "").trim() || existente?.nombre || "",
      costo,
      precioVenta,
      stockMinimo: (v.stockMinimo ?? "").trim() || existente?.stockMinimo.toString() || "0",
      unidad,
      fraccionado,
      porcentajeIva: ivaTexto ? Number(ivaTexto.replace(",", ".")) : existente?.porcentajeIva ?? 0,
      condicion,
    };
    const validado = esquemaProducto.safeParse(entrada);
    if (!validado.success) {
      errorFila(validado.error.issues[0].message);
      continue;
    }

    const barras = validado.data.codigoBarras;
    if (barras) {
      const otro = barrasEnUso.get(barras);
      if (otro && otro !== clave) {
        errorFila(`El código de barras ${barras} ya lo tiene otro producto.`);
        continue;
      }
      if (barrasVistas.has(barras)) {
        errorFila(`El código de barras ${barras} está repetido (también en la fila ${barrasVistas.get(barras)}).`);
        continue;
      }
      barrasVistas.set(barras, numero);
    }

    const stockTexto = (v.stock ?? "").trim();
    let stock: Decimal | null = null;
    if (stockTexto) {
      stock = leerCantidad(stockTexto);
      const error = validarCantidad(stock, { fraccionado: validado.data.fraccionado });
      if (error) {
        errorFila(`Stock "${stockTexto}": ${MENSAJES_CANTIDAD[error]}`);
        continue;
      }
    } else if (!existente) {
      stock = new Decimal(0);
    }

    productos.push({
      fila: numero,
      codigo,
      existenteId: existente?.id ?? null,
      categoria: categoriaNombre || null,
      datos: { ...validado.data, codigoBarras: validado.data.codigoBarras ?? null },
      stock,
    });
  }

  const nuevos = productos.filter((p) => !p.existenteId).length;
  const analisis: AnalisisImportacion = {
    ok: errores.length === 0,
    total: filas.length,
    nuevos,
    actualizados: productos.length - nuevos,
    categoriasNuevas: [...categoriasNuevas.values()].sort((a, b) => a.localeCompare(b, "es")),
    errores: errores.slice(0, 500),
    muestra: productos.slice(0, 20).map((p) => ({
      fila: p.fila,
      codigo: p.codigo,
      nombre: p.datos.nombre,
      precioVenta: p.datos.precioVenta ?? null,
      stock: p.stock ? p.stock.toString() : null,
      accion: p.existenteId ? "actualizar" : "nuevo",
    })),
  };
  if (errores.length > 500) analisis.error = `Hay ${errores.length} filas con errores; mostramos las primeras 500.`;
  return { analisis, productos, categoriasExistentes: categoriasPorNombre };
}

export async function analizarImportacion(ctx: Contexto, negocioId: string, archivo: Uint8Array, nombreArchivo: string) {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  return (await analizar(ctx, negocioId, archivo, nombreArchivo)).analisis;
}

export async function ejecutarImportacion(ctx: Contexto, negocioId: string, archivo: Uint8Array, nombreArchivo: string) {
  exigirGestion(ctx);
  exigirNegocioPermitido(ctx, negocioId);
  const { analisis, productos, categoriasExistentes } = await analizar(ctx, negocioId, archivo, nombreArchivo);
  if (!analisis.ok || !categoriasExistentes) return analisis;

  await prisma.$transaction(
    async (tx) => {
      // 1. Categorías nuevas
      const idsCategorias = new Map([...categoriasExistentes].map(([k, c]) => [k, c.id]));
      for (const nombre of analisis.categoriasNuevas) {
        const creada = await tx.categoria.create({
          data: { empresaId: ctx.empresaId, negocioId, nombre },
          select: { id: true },
        });
        idsCategorias.set(normalizar(nombre), creada.id);
      }
      const categoriaDe = (p: ProductoImportado) => (p.categoria ? idsCategorias.get(normalizar(p.categoria)) ?? null : undefined);

      // 2. Productos nuevos (en bloques, con stock 0; el stock entra como movimiento)
      const nuevos = productos.filter((p) => !p.existenteId);
      for (let i = 0; i < nuevos.length; i += 1000) {
        await tx.producto.createMany({
          data: nuevos.slice(i, i + 1000).map((p) => ({
            ...(p.datos as Required<ProductoImportado["datos"]>),
            unidad: p.datos.unidad as never,
            condicion: p.datos.condicion as never,
            codigo: p.codigo,
            categoriaId: categoriaDe(p) ?? null,
            empresaId: ctx.empresaId,
            negocioId,
          })),
        });
      }
      const creados = await tx.producto.findMany({
        where: { negocioId, codigo: { in: nuevos.map((p) => p.codigo) } },
        select: { id: true, codigo: true },
      });
      const idPorCodigo = new Map(creados.map((c) => [c.codigo.toLowerCase(), c.id]));

      // 3. Productos existentes
      const actualizados = productos.filter((p) => p.existenteId);
      for (const p of actualizados) {
        const categoriaId = categoriaDe(p);
        await tx.producto.update({
          where: { id: p.existenteId! },
          data: {
            ...p.datos,
            unidad: p.datos.unidad as never,
            condicion: p.datos.condicion as never,
            ...(categoriaId === undefined ? {} : { categoriaId }),
            activo: true,
          },
        });
      }

      // 4. Stock: cada cambio queda como movimiento de importación
      for (const p of productos) {
        if (!p.stock) continue;
        const id = p.existenteId ?? idPorCodigo.get(p.codigo.toLowerCase())!;
        const [fila] = await tx.$queryRaw<{ stock: { toString(): string } }[]>`
          SELECT "stock" FROM "Producto" WHERE "id" = ${id} FOR UPDATE`;
        const delta = p.stock.minus(fila.stock.toString());
        if (delta.isZero()) continue;
        await registrarMovimiento(tx, ctx, { productoId: id, tipo: "IMPORTACION", cantidad: delta, nota: nombreArchivo.slice(0, 100) });
      }

      // 5. Un solo registro de auditoría para toda la importación
      await tx.auditoria.create({
        data: {
          empresaId: ctx.empresaId,
          negocioId,
          usuarioId: ctx.usuarioId,
          accion: "IMPORTACION",
          entidad: "Producto",
          detalle: {
            archivo: nombreArchivo.slice(0, 200),
            nuevos: analisis.nuevos,
            actualizados: analisis.actualizados,
            categoriasNuevas: analisis.categoriasNuevas.length,
          },
        },
      });
    },
    { timeout: 300_000, maxWait: 10_000 },
  );

  return analisis;
}

/** Plantilla de Excel con encabezados, un ejemplo y una hoja de instrucciones. */
export async function generarPlantilla() {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Control Total · EMY TELECOM";
  const hoja = libro.addWorksheet("Productos", { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = COLUMNAS.map((c) => ({ header: c.titulo, key: c.clave, width: Math.max(14, c.titulo.length + 4) }));
  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E9A" } };
  hoja.addRow(Object.fromEntries(COLUMNAS.map((c) => [c.clave, c.ejemplo])));
  hoja.addRow({
    codigo: "CAB-12", codigoBarras: "", nombre: "Cable eléctrico #12", categoria: "Eléctricos",
    costo: "1800", precioVenta: "", stock: "150,5", stockMinimo: "20", unidad: "metro", fraccionado: "sí", iva: "19", condicion: "nuevo",
  });
  hoja.getColumn("codigo").numFmt = "@";
  hoja.getColumn("codigoBarras").numFmt = "@";

  const ayuda = libro.addWorksheet("Instrucciones");
  ayuda.columns = [
    { header: "Columna", key: "titulo", width: 22 },
    { header: "Qué escribir", key: "nota", width: 70 },
  ];
  ayuda.getRow(1).font = { bold: true };
  COLUMNAS.forEach((c) => ayuda.addRow({ titulo: c.titulo, nota: c.nota }));
  ayuda.addRow({});
  ayuda.addRow({ titulo: "Importante", nota: "Borra las filas de ejemplo antes de subir el archivo." });
  ayuda.addRow({ titulo: "", nota: "Si un código ya existe, se actualiza ese producto en lugar de crear uno nuevo." });
  ayuda.addRow({ titulo: "", nota: "Las cantidades con decimales se escriben con coma: 2,5" });

  return Buffer.from(await libro.xlsx.writeBuffer());
}
