"use server";

import { revalidatePath } from "next/cache";
import { agregarVariantes, cambiarPrecioPrenda, crearPrenda, registrarLlegada } from "@/lib/datos/prendas";
import { leerPesos } from "@/lib/inventario/esquemas";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";

export type ResultadoPrenda = { ok: true; prendaId: string } | { ok: false; error: string; campos?: Record<string, string> };

async function contextoPrendas() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "INVENTARIO");
  return ctx;
}

/** "Nueva prenda": recibe los datos del formulario (nombre, precio, tallas, colores y cantidades). */
export async function crearPrendaAccion(datos: unknown): Promise<ResultadoPrenda> {
  const ctx = await contextoPrendas();
  if (!ctx.negocioActivoId) return { ok: false, error: "Elige un negocio primero." };
  const r = await crearPrenda(ctx, ctx.negocioActivoId, datos);
  if (!r.ok) return { ok: false, error: r.error, campos: r.campos };
  revalidatePath("/inventario");
  return { ok: true, prendaId: r.prendaId };
}

export async function agregarVariantesAccion(prendaId: string, datos: unknown): Promise<ResultadoPrenda> {
  const ctx = await contextoPrendas();
  const r = await agregarVariantes(ctx, prendaId, datos);
  if (!r.ok) return { ok: false, error: r.error, campos: r.campos };
  revalidatePath("/inventario");
  return { ok: true, prendaId };
}

export async function cambiarPrecioPrendaAccion(prendaId: string, precio: string): Promise<ResultadoPrenda> {
  const ctx = await contextoPrendas();
  const valor = leerPesos(precio);
  if (valor === null) return { ok: false, error: "Escribe un precio válido, por ejemplo 45.000." };
  const r = await cambiarPrecioPrenda(ctx, prendaId, valor);
  if (!r.ok) return { ok: false, error: r.error, campos: r.campos };
  revalidatePath("/inventario");
  return { ok: true, prendaId };
}

/** "Llegó mercancía": suma lo que llegó y crea tallas o colores nuevos. Devuelve "id.cantidad,…" para las etiquetas. */
export async function registrarLlegadaAccion(
  prendaId: string,
  datos: unknown,
): Promise<{ ok: true; etiquetas: string } | { ok: false; error: string; campos?: Record<string, string> }> {
  const ctx = await contextoPrendas();
  const r = await registrarLlegada(ctx, prendaId, datos);
  if (!r.ok) return { ok: false, error: r.error, campos: r.campos };
  revalidatePath("/inventario");
  return { ok: true, etiquetas: r.llegaron.map((l) => `${l.id}.${l.cantidad}`).join(",") };
}
