"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { abrirCaja, cerrarCaja, reabrirCaja } from "@/lib/datos/caja";
import { buscarClientes, crearCliente } from "@/lib/datos/clientes";
import { obtenerDatosNegocio } from "@/lib/datos/negocios";
import { buscarParaVenta, productosParaVenta } from "@/lib/datos/productos";
import { anularVenta, obtenerVenta, registrarDevolucion, registrarVenta } from "@/lib/datos/ventas";
import { leerPesos } from "@/lib/inventario/esquemas";
import { exigirModulo } from "@/lib/modulos";
import { obtenerContexto } from "@/lib/sesion";
import { enlaceWhatsApp, textoWhatsApp } from "@/lib/ventas/recibo";

async function contextoVentas() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "VENTAS");
  return ctx;
}

async function negocioActivo() {
  const ctx = await contextoVentas();
  if (!ctx.negocioActivoId) throw new Error("Sin negocio activo");
  return { ctx, negocioId: ctx.negocioActivoId };
}

export async function buscarProductoCaja(texto: string) {
  const { ctx, negocioId } = await negocioActivo();
  return buscarParaVenta(ctx, negocioId, z.string().max(100).parse(texto));
}

export async function refrescarCarrito(ids: string[]) {
  const { ctx, negocioId } = await negocioActivo();
  return productosParaVenta(ctx, negocioId, z.array(z.string().max(40)).max(300).parse(ids));
}

const descuento = z
  .object({ tipo: z.enum(["pesos", "porcentaje"]), valor: z.number().min(0).max(1_000_000_000) })
  .nullable()
  .optional();

const esquemaVenta = z.object({
  negocioId: z.string().min(1).max(40),
  lineas: z
    .array(z.object({ productoId: z.string().min(1).max(40), cantidad: z.string().max(20), descuento }))
    .min(1)
    .max(300),
  descuentoGeneral: descuento,
  clienteId: z.string().max(40).nullable().optional(),
  totalEsperado: z.number().int().min(0),
  pago: z.discriminatedUnion("forma", [
    z.object({ forma: z.literal("efectivo"), recibido: z.number().int().min(0) }),
    z.object({ forma: z.literal("transferencia"), referencia: z.string().max(100).nullable().optional() }),
    z.object({
      forma: z.literal("mixto"),
      transferencia: z.number().int().min(0),
      recibido: z.number().int().min(0),
      referencia: z.string().max(100).nullable().optional(),
    }),
  ]),
});

export type EntradaCobro = z.infer<typeof esquemaVenta>;

export async function cobrar(entrada: EntradaCobro) {
  const { ctx, negocioId } = await negocioActivo();
  const datos = esquemaVenta.safeParse(entrada);
  if (!datos.success) return { ok: false as const, error: "Revisa los datos de la venta." };
  // El carrito es de un negocio: si el cajero cambió de negocio arriba, no se cobra en el otro.
  if (datos.data.negocioId !== negocioId) {
    return { ok: false as const, error: "Cambiaste de negocio. Vuelve al negocio de esta venta para cobrarla." };
  }
  const resultado = await registrarVenta(ctx, negocioId, datos.data);
  if (resultado.ok) revalidatePath("/ventas", "layout");
  return resultado;
}

export async function buscarClientesCaja(texto: string) {
  const { ctx, negocioId } = await negocioActivo();
  return buscarClientes(ctx, negocioId, z.string().max(100).parse(texto));
}

export async function crearClienteCaja(entrada: Record<string, string | null>) {
  const { ctx, negocioId } = await negocioActivo();
  return crearCliente(ctx, negocioId, entrada);
}

/** Enlace de WhatsApp con el recibo escrito, al número del cliente si lo tiene. */
export async function enlaceReciboWhatsApp(ventaId: string) {
  const ctx = await contextoVentas();
  const venta = await obtenerVenta(ctx, z.string().max(40).parse(ventaId));
  if (!venta) return null;
  const negocio = await obtenerDatosNegocio(ctx, venta.negocioId);
  const texto = textoWhatsApp(venta, negocio?.nombre ?? "", negocio?.mensajeRecibo);
  return enlaceWhatsApp(texto, venta.cliente?.telefono);
}

export type EstadoAccion = { error?: string; campos?: Record<string, string>; ok?: boolean; mensaje?: string };

export async function abrirCajaAccion(_: EstadoAccion, formulario: FormData): Promise<EstadoAccion> {
  const { ctx, negocioId } = await negocioActivo();
  const base = leerPesos(String(formulario.get("base") ?? "0") || "0");
  if (base === null || base < 0) return { error: "Escribe la base en pesos, por ejemplo 100.000.", campos: { base: "Revisa el valor." } };
  const r = await abrirCaja(ctx, negocioId, base);
  if (!r.ok) return { error: r.error, campos: r.campos };
  revalidatePath("/ventas", "layout");
  return { ok: true };
}

export async function cerrarCajaAccion(_: EstadoAccion, formulario: FormData): Promise<EstadoAccion> {
  const ctx = await contextoVentas();
  const contado = leerPesos(String(formulario.get("contado") ?? ""));
  if (contado === null || contado < 0) return { error: "Escribe cuánto efectivo contaste.", campos: { contado: "Revisa el valor." } };
  const r = await cerrarCaja(ctx, String(formulario.get("cajaId") ?? ""), contado, String(formulario.get("nota") ?? ""));
  if (!r.ok) return { error: r.error, campos: r.campos };
  // Sin revalidar aquí: la página se volvería a dibujar sin caja abierta y se perdería
  // el mensaje de "Caja cerrada". Al tocar "Listo" se carga la pantalla de ventas al día.
  return { ok: true, mensaje: r.diferencia === null ? undefined : String(r.diferencia) };
}

export async function reabrirCajaAccion(cajaId: string): Promise<EstadoAccion> {
  const ctx = await contextoVentas();
  const r = await reabrirCaja(ctx, z.string().max(40).parse(cajaId));
  if (!r.ok) return { error: r.error };
  revalidatePath("/ventas", "layout");
  return { ok: true };
}

export async function anularAccion(_: EstadoAccion, formulario: FormData): Promise<EstadoAccion> {
  const ctx = await contextoVentas();
  const r = await anularVenta(ctx, String(formulario.get("ventaId") ?? ""), String(formulario.get("motivo") ?? ""));
  if (!r.ok) return { error: r.error, campos: r.campos };
  revalidatePath("/ventas", "layout");
  revalidatePath("/inventario");
  return { ok: true };
}

const esquemaDevolucion = z.object({
  ventaId: z.string().min(1).max(40),
  motivo: z.string().max(300),
  medio: z.enum(["EFECTIVO", "TRANSFERENCIA"]),
  lineas: z.array(z.object({ detalleVentaId: z.string().min(1).max(40), cantidad: z.string().max(20) })).max(300),
});

export async function devolucionAccion(entrada: z.infer<typeof esquemaDevolucion>) {
  const ctx = await contextoVentas();
  const datos = esquemaDevolucion.safeParse(entrada);
  if (!datos.success) return { ok: false as const, error: "Revisa los datos de la devolución." };
  const r = await registrarDevolucion(ctx, datos.data.ventaId, datos.data);
  if (r.ok) {
    revalidatePath("/ventas", "layout");
    revalidatePath("/inventario");
  }
  return r;
}
