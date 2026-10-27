"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MotivoAjuste } from "@/generated/prisma/enums";
import { guardarCategoria, guardarMargenNegocio } from "@/lib/datos/categorias";
import { registrarPiezaSegunda } from "@/lib/datos/compras";
import { FOTO_MAXIMO, guardarFotoProducto } from "@/lib/datos/fotos-producto";
import { analizarImportacion, ejecutarImportacion, type AnalisisImportacion } from "@/lib/datos/importacion";
import { actualizarProducto, ajustarStock, cambiarActivoProducto, crearProducto } from "@/lib/datos/inventario";
import { buscarPorCodigoExacto } from "@/lib/datos/productos";
import { erroresPorCampo, esquemaPiezaSegunda, esquemaProducto } from "@/lib/inventario/esquemas";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";

export type EstadoFormulario = { error?: string; campos?: Record<string, string>; ok?: boolean };

async function contextoInventario() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  return ctx;
}

function texto(formulario: FormData, campo: string) {
  const v = formulario.get(campo);
  return typeof v === "string" ? v : "";
}

/** Para el lector de código de barras: devuelve el id si el código coincide exacto. */
export async function irACodigo(codigo: string) {
  const ctx = await contextoInventario();
  if (!ctx.negocioActivoId) return null;
  return buscarPorCodigoExacto(ctx, ctx.negocioActivoId, z.string().max(100).parse(codigo));
}

export async function guardarProducto(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const ctx = await contextoInventario();
  const id = texto(formulario, "id");
  const datos = esquemaProducto.safeParse({
    codigo: texto(formulario, "codigo"),
    codigoBarras: texto(formulario, "codigoBarras"),
    nombre: texto(formulario, "nombre"),
    descripcion: texto(formulario, "descripcion"),
    categoriaId: texto(formulario, "categoriaId"),
    costo: texto(formulario, "costo") || "0",
    precioVenta: texto(formulario, "precioVenta"),
    stockMinimo: texto(formulario, "stockMinimo") || "0",
    unidad: texto(formulario, "unidad"),
    fraccionado: formulario.get("fraccionado") === "on",
    porcentajeIva: texto(formulario, "porcentajeIva"),
    condicion: texto(formulario, "condicion"),
    controlaStock: formulario.get("sinStock") !== "on",
    // La casilla solo se muestra si el negocio usa botones rápidos; si no se mostró, no se toca.
    botonRapido: formulario.get("conBotonRapido") === "1" ? formulario.get("botonRapido") === "on" : undefined,
  });
  if (!datos.success) {
    return { error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  }

  let resultado;
  if (id) {
    resultado = await actualizarProducto(ctx, id, datos.data);
  } else {
    if (!ctx.negocioActivoId) return { error: "Elige un negocio primero." };
    resultado = await crearProducto(ctx, ctx.negocioActivoId, datos.data, texto(formulario, "stockInicial"));
  }
  if (!resultado.ok) return { error: resultado.error, campos: resultado.campos };

  revalidatePath("/inventario");
  if (formulario.get("otro") === "1") redirect(`/inventario/nuevo?creado=${Date.now()}`);
  redirect(`/inventario/${resultado.id}`);
}

/** "Compré una pieza de segunda": crea el producto, registra la compra y lleva a imprimir la etiqueta. */
export async function guardarPiezaSegunda(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const ctx = await contextoInventario();
  if (!ctx.negocioActivoId) return { error: "Elige un negocio primero." };
  const datos = esquemaPiezaSegunda.safeParse({
    nombre: texto(formulario, "nombre"),
    descripcion: texto(formulario, "descripcion"),
    categoriaId: texto(formulario, "categoriaId"),
    proveedorId: texto(formulario, "proveedorId"),
    cantidad: texto(formulario, "cantidad") || "1",
    costo: texto(formulario, "costo") || "0",
    precioVenta: texto(formulario, "precioVenta"),
    porcentajeIva: texto(formulario, "porcentajeIva"),
    medio: texto(formulario, "medio"),
    desdeCaja: formulario.get("desdeCaja") === "on",
  });
  if (!datos.success) return { error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };

  const resultado = await registrarPiezaSegunda(ctx, ctx.negocioActivoId, datos.data);
  if (!resultado.ok) return { error: resultado.error, campos: resultado.campos };
  revalidatePath("/inventario");
  revalidatePath("/proveedores");
  redirect(`/etiqueta/${resultado.id}?nueva=1`);
}

const esquemaAjuste = z.object({
  productoId: z.string().min(1).max(40),
  modo: z.enum(["nuevo", "diferencia"]),
  cantidad: z.string().trim().min(1, "Escribe la cantidad.").max(30),
  motivo: z.enum(MotivoAjuste, { message: "Elige el motivo del ajuste." }),
  nota: z.string().trim().max(300).optional(),
});

export async function guardarAjuste(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const ctx = await contextoInventario();
  const datos = esquemaAjuste.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const { productoId, ...ajuste } = datos.data;
  const resultado = await ajustarStock(ctx, productoId, ajuste);
  if (!resultado.ok) return { error: resultado.error, campos: resultado.campos };
  revalidatePath("/inventario");
  redirect(`/inventario/${productoId}?ajustado=1`);
}

export async function desactivarProducto(id: string, activo: boolean) {
  const ctx = await contextoInventario();
  const resultado = await cambiarActivoProducto(ctx, z.string().max(40).parse(id), activo);
  revalidatePath("/inventario");
  return resultado;
}

const margen = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 1000), "Escribe un margen entre 0 y 1000 %.");

export async function guardarCategoriaAccion(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const ctx = await contextoInventario();
  if (!ctx.negocioActivoId) return { error: "Elige un negocio primero." };
  const datos = z
    .object({
      id: z.string().max(40).optional(),
      nombre: z.string().trim().min(1, "Escribe el nombre.").max(80),
      margenSugerido: margen,
      activo: z.enum(["si", "no"]).optional(),
    })
    .safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: "Revisa los campos marcados.", campos: erroresPorCampo(datos.error) };
  const r = await guardarCategoria(ctx, ctx.negocioActivoId, {
    id: datos.data.id || undefined,
    nombre: datos.data.nombre,
    margenSugerido: datos.data.margenSugerido,
    activo: datos.data.activo === undefined ? undefined : datos.data.activo === "si",
  });
  if (!r.ok) return { error: r.error, campos: r.campos };
  revalidatePath("/inventario/categorias");
  return { ok: true };
}

export async function guardarMargenAccion(_: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const ctx = await contextoInventario();
  if (!ctx.negocioActivoId) return { error: "Elige un negocio primero." };
  const datos = margen.safeParse(texto(formulario, "margen"));
  if (!datos.success || datos.data === null) return { campos: { margen: "Escribe un margen entre 0 y 1000 %." } };
  await guardarMargenNegocio(ctx, ctx.negocioActivoId, datos.data);
  revalidatePath("/inventario/categorias");
  return { ok: true };
}

export type EstadoImportacion = { analisis?: AnalisisImportacion; importado?: boolean; error?: string };

async function leerArchivo(formulario: FormData) {
  const archivo = formulario.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return null;
  return { bytes: new Uint8Array(await archivo.arrayBuffer()), nombre: archivo.name };
}

export async function importarAccion(_: EstadoImportacion, formulario: FormData): Promise<EstadoImportacion> {
  const ctx = await contextoInventario();
  if (!ctx.negocioActivoId) return { error: "Elige un negocio primero." };
  const archivo = await leerArchivo(formulario);
  if (!archivo) return { error: "Elige un archivo de Excel o CSV." };

  if (formulario.get("confirmar") !== "1") {
    return { analisis: await analizarImportacion(ctx, ctx.negocioActivoId, archivo.bytes, archivo.nombre) };
  }
  const analisis = await ejecutarImportacion(ctx, ctx.negocioActivoId, archivo.bytes, archivo.nombre);
  if (analisis.ok) revalidatePath("/inventario");
  return { analisis, importado: analisis.ok };
}

/** Pone o quita (sin archivo) la foto del producto. La foto ya llega achicada desde el navegador. */
export async function guardarFotoAccion(productoId: string, formulario: FormData): Promise<EstadoFormulario> {
  const ctx = await contextoInventario();
  const archivo = formulario.get("foto");
  let bytes: Uint8Array | null = null;
  if (archivo instanceof File && archivo.size > 0) {
    if (archivo.size > FOTO_MAXIMO) return { error: "La foto pesa demasiado. Prueba con otra." };
    bytes = new Uint8Array(await archivo.arrayBuffer());
  }
  const r = await guardarFotoProducto(ctx, productoId, bytes);
  if (!r.ok) return { error: r.error };
  revalidatePath("/inventario");
  revalidatePath("/ventas");
  return { ok: true };
}
