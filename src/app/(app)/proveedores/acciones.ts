"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  anularAbono,
  anularFactura,
  buscarProductosCompra,
  cambiarActivoProveedor,
  eliminarAdjunto,
  guardarAdjunto,
  guardarProveedor,
  productosParaCompra,
  registrarAbono,
  registrarFactura,
} from "@/lib/datos/compras";
import { crearProducto } from "@/lib/datos/inventario";
import { erroresPorCampo, esquemaProducto } from "@/lib/inventario/esquemas";
import { exigirModulo } from "@/lib/modulos";
import { exigirGestion } from "@/lib/permisos";
import { obtenerContexto } from "@/lib/sesion";

export type EstadoAccion = {
  error?: string;
  campos?: Record<string, string>;
  ok?: boolean;
  id?: string;
};

async function contextoCompras() {
  const ctx = await obtenerContexto();
  exigirModulo(ctx, "PROVEEDORES");
  exigirGestion(ctx);
  return ctx;
}

async function negocioActivo() {
  const ctx = await contextoCompras();
  if (!ctx.negocioActivoId) throw new Error("Sin negocio activo");
  return { ctx, negocioId: ctx.negocioActivoId };
}

const texto = (f: FormData, campo: string) => {
  const v = f.get(campo);
  return typeof v === "string" ? v : "";
};

// ─── Proveedores ────────────────────────────────────────────────────────────

export async function guardarProveedorAccion(_: EstadoAccion, f: FormData): Promise<EstadoAccion> {
  const { ctx, negocioId } = await negocioActivo();
  const id = texto(f, "id") || null;
  const r = await guardarProveedor(ctx, negocioId, id, {
    nombre: texto(f, "nombre"),
    nit: texto(f, "nit"),
    contacto: texto(f, "contacto"),
    telefono: texto(f, "telefono"),
    correo: texto(f, "correo"),
    notas: texto(f, "notas"),
  });
  if (!r.ok) return { error: r.error, campos: r.campos };
  revalidatePath("/proveedores", "layout");
  const volver = texto(f, "volver");
  redirect(volver.startsWith("/proveedores/") ? volver : `/proveedores/directorio/${r.id}`);
}

/** Desde la factura: crea el proveedor sin salir de la pantalla. */
export async function crearProveedorRapido(entrada: { nombre: string; nit: string; telefono: string }) {
  const { ctx, negocioId } = await negocioActivo();
  const r = await guardarProveedor(ctx, negocioId, null, entrada);
  if (r.ok) revalidatePath("/proveedores", "layout");
  return r;
}

export async function cambiarActivoProveedorAccion(id: string, activo: boolean) {
  const ctx = await contextoCompras();
  const r = await cambiarActivoProveedor(ctx, z.string().max(40).parse(id), activo);
  revalidatePath("/proveedores", "layout");
  return r;
}

// ─── Factura ────────────────────────────────────────────────────────────────

export async function buscarProductoFactura(q: string) {
  const { ctx, negocioId } = await negocioActivo();
  return buscarProductosCompra(ctx, negocioId, z.string().max(100).parse(q));
}

export async function refrescarProductosFactura(ids: string[]) {
  const { ctx, negocioId } = await negocioActivo();
  return productosParaCompra(ctx, negocioId, z.array(z.string().max(40)).max(300).parse(ids));
}

/** Producto que no existía: se crea con stock 0 y entra con la factura. */
export async function crearProductoFactura(entrada: Record<string, unknown>) {
  const { ctx, negocioId } = await negocioActivo();
  const datos = esquemaProducto.safeParse({
    stockMinimo: "0",
    condicion: "NUEVO",
    descripcion: "",
    ...entrada,
  });
  if (!datos.success)
    return {
      ok: false as const,
      error: "Revisa los campos marcados.",
      campos: erroresPorCampo(datos.error),
    };
  const r = await crearProducto(ctx, negocioId, datos.data, "0");
  if (!r.ok) return r;
  revalidatePath("/inventario");
  const [producto] = await productosParaCompra(ctx, negocioId, [r.id]);
  return { ok: true as const, producto };
}

const medio = z.enum(["EFECTIVO", "TRANSFERENCIA"]);
const esquemaFactura = z.object({
  proveedorId: z.string().max(40),
  numero: z.string().max(60),
  fecha: z.string().max(10),
  vencimiento: z.string().max(10).nullable().optional(),
  nota: z.string().max(300).nullable().optional(),
  lineas: z
    .array(
      z.object({
        productoId: z.string().max(40),
        cantidad: z.string().max(30),
        costoUnitario: z.number().int(),
        precioVenta: z.number().int().nullable(),
        confirmado: z.boolean().optional(),
      }),
    )
    .max(300),
  pago: z.discriminatedUnion("tipo", [
    z.object({
      tipo: z.literal("contado"),
      medio,
      desdeCaja: z.boolean(),
      referencia: z.string().max(100).nullable().optional(),
    }),
    z.object({ tipo: z.literal("credito") }),
  ]),
});

export async function guardarFacturaAccion(entrada: z.infer<typeof esquemaFactura>) {
  const { ctx, negocioId } = await negocioActivo();
  const datos = esquemaFactura.safeParse(entrada);
  if (!datos.success) return { ok: false as const, error: "Revisa los datos de la factura." };
  const r = await registrarFactura(ctx, negocioId, datos.data);
  if (r.ok) {
    revalidatePath("/proveedores", "layout");
    revalidatePath("/inventario", "layout");
  }
  return r;
}

// ─── Pagos, anulación y adjuntos ────────────────────────────────────────────

const esquemaAbono = z.object({
  facturaId: z.string().max(40),
  valor: z.number().int(),
  medio,
  desdeCaja: z.boolean(),
  referencia: z.string().max(100).nullable().optional(),
  nota: z.string().max(300).nullable().optional(),
});

export async function abonoAccion(entrada: z.infer<typeof esquemaAbono>) {
  const ctx = await contextoCompras();
  const datos = esquemaAbono.safeParse(entrada);
  if (!datos.success) return { ok: false as const, error: "Revisa los datos del pago." };
  const { facturaId, ...abono } = datos.data;
  const r = await registrarAbono(ctx, facturaId, abono);
  if (r.ok) revalidatePath("/proveedores", "layout");
  return r;
}

export async function anularAbonoAccion(abonoId: string) {
  const ctx = await contextoCompras();
  const r = await anularAbono(ctx, z.string().max(40).parse(abonoId));
  if (r.ok) revalidatePath("/proveedores", "layout");
  return r;
}

export async function anularFacturaAccion(_: EstadoAccion, f: FormData): Promise<EstadoAccion> {
  const ctx = await contextoCompras();
  const r = await anularFactura(ctx, texto(f, "facturaId").slice(0, 40), texto(f, "motivo"));
  if (!r.ok) return { error: r.error, campos: r.campos };
  revalidatePath("/proveedores", "layout");
  revalidatePath("/inventario", "layout");
  return { ok: true };
}

export async function subirAdjuntoAccion(f: FormData) {
  const ctx = await contextoCompras();
  const archivo = f.get("archivo");
  if (!(archivo instanceof File)) return { ok: false as const, error: "Elige un archivo." };
  const r = await guardarAdjunto(
    ctx,
    texto(f, "facturaId").slice(0, 40),
    archivo.name,
    new Uint8Array(await archivo.arrayBuffer()),
  );
  if (r.ok) revalidatePath("/proveedores", "layout");
  return r;
}

export async function eliminarAdjuntoAccion(id: string) {
  const ctx = await contextoCompras();
  const r = await eliminarAdjunto(ctx, z.string().max(40).parse(id));
  if (r.ok) revalidatePath("/proveedores", "layout");
  return r;
}
