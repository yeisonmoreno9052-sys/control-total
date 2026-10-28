// Permiso "Puede crear y editar productos" para cajeros: crea y edita sin ver ni tocar costos,
// sin desactivar ni ajustar stock, y siempre dentro de su negocio.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/datos/cliente";
import { cargarContexto, type Contexto } from "@/lib/datos/contexto";
import { guardarFotoProducto } from "@/lib/datos/fotos-producto";
import { actualizarProducto, ajustarStock, cambiarActivoProducto, crearProducto } from "@/lib/datos/inventario";
import { obtenerProducto } from "@/lib/datos/productos";
import { crearUsuario, editarUsuario } from "@/lib/datos/usuarios";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterAll(() => prisma.$disconnect());

const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);

const producto = (extra: Record<string, unknown> = {}) =>
  esquemaProducto.parse({
    codigo: "AREPA", nombre: "Arepa con queso", costo: "1200", precioVenta: "4000", stockMinimo: "0",
    unidad: "UNIDAD", fraccionado: false, porcentajeIva: 0, condicion: "NUEVO", controlaStock: false,
    ...extra,
  });

/** Doña Nelly: cajera de motos a la que la administradora le dio el permiso. */
async function cajeraConPermiso(rol = "CAJERO"): Promise<Contexto> {
  const r = await crearUsuario(e.ctx.admin, {
    nombre: "Nelly", usuario: "nelly", contrasena: "Cafecito-2026", rol, negocios: [e.motos.id], puedeCrearProductos: true,
  });
  if (!r.ok) throw new Error(r.error);
  const ctx = await cargarContexto(r.id);
  if (!ctx) throw new Error("sin contexto");
  return ctx;
}

describe("cajero que crea productos", () => {
  it("sin el permiso, el cajero no crea ni edita productos", async () => {
    expect(e.ctx.cajero.puedeCrearProductos).toBe(false);
    await expect(crearProducto(e.ctx.cajero, e.motos.id, producto(), "0")).rejects.toThrow();
  });

  it("con el permiso crea el producto con costo 0 y queda en el historial", async () => {
    const nelly = await cajeraConPermiso();
    expect(nelly.puedeCrearProductos).toBe(true);
    const r = await crearProducto(nelly, e.motos.id, producto(), "0");
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const guardado = await prisma.producto.findUniqueOrThrow({ where: { id: r.id } });
    expect(guardado).toMatchObject({ costo: 0, precioVenta: 4000, nombre: "Arepa con queso" });
    // Ella no ve el costo al consultar el producto.
    expect((await obtenerProducto(nelly, r.id))?.costo).toBeUndefined();
    const auditoria = await prisma.auditoria.findFirstOrThrow({ where: { accion: "CREACION_PRODUCTO", entidadId: r.id } });
    expect(auditoria.usuarioId).toBe(nelly.usuarioId);
  });

  it("edita nombre y precio pero no cambia el costo que puso la administradora", async () => {
    const nelly = await cajeraConPermiso();
    const r = await crearProducto(e.ctx.admin, e.motos.id, producto(), "0");
    if (!r.ok) throw new Error(r.error);

    const editado = await actualizarProducto(nelly, r.id, producto({ nombre: "Arepa rellena", costo: "1", precioVenta: "4500" }));
    expect(editado.ok).toBe(true);
    const guardado = await prisma.producto.findUniqueOrThrow({ where: { id: r.id } });
    expect(guardado).toMatchObject({ nombre: "Arepa rellena", costo: 1200, precioVenta: 4500 });
    const cambio = await prisma.auditoria.findFirstOrThrow({ where: { accion: "CAMBIO_PRECIO", entidadId: r.id } });
    expect(cambio.usuarioId).toBe(nelly.usuarioId);
  });

  it("pone la foto, pero no desactiva ni ajusta el stock", async () => {
    const nelly = await cajeraConPermiso();
    const r = await crearProducto(e.ctx.admin, e.motos.id, producto({ controlaStock: true }), "10");
    if (!r.ok) throw new Error(r.error);

    expect(await guardarFotoProducto(nelly, r.id, WEBP)).toMatchObject({ ok: true });
    await expect(cambiarActivoProducto(nelly, r.id, false)).rejects.toThrow();
    await expect(ajustarStock(nelly, r.id, { modo: "nuevo", cantidad: "50", motivo: "CONTEO" })).rejects.toThrow();
  });

  it("no crea ni edita en otro negocio ni en otra empresa", async () => {
    const nelly = await cajeraConPermiso();
    await expect(crearProducto(nelly, e.ferreteria.id, producto(), "0")).rejects.toThrow();
    await expect(crearProducto(nelly, e.tiendaOtra.id, producto(), "0")).rejects.toThrow();

    const ferre = await crearProducto(e.ctx.admin, e.ferreteria.id, producto(), "0");
    const otra = await crearProducto(e.ctx.adminOtra, e.tiendaOtra.id, producto(), "0");
    if (!ferre.ok || !otra.ok) throw new Error("no se crearon");
    expect(await actualizarProducto(nelly, ferre.id, producto({ precioVenta: "1" }))).toMatchObject({ ok: false });
    expect(await actualizarProducto(nelly, otra.id, producto({ precioVenta: "1" }))).toMatchObject({ ok: false });
    expect(await guardarFotoProducto(nelly, ferre.id, WEBP)).toMatchObject({ ok: false });
  });

  it("solo la administradora da o quita el permiso, y solo aplica a cajeros", async () => {
    await expect(
      editarUsuario(e.ctx.cajero, e.ctx.cajero.usuarioId, { nombre: "Cajero", rol: "CAJERO", negocios: [e.motos.id], puedeCrearProductos: true }),
    ).rejects.toThrow();

    const r = await editarUsuario(e.ctx.admin, e.ctx.cajero.usuarioId, {
      nombre: "Cajero", rol: "CAJERO", negocios: [e.motos.id], puedeCrearProductos: true,
    });
    expect(r.ok).toBe(true);
    expect((await cargarContexto(e.ctx.cajero.usuarioId))?.puedeCrearProductos).toBe(true);
    const auditoria = await prisma.auditoria.findFirstOrThrow({ where: { accion: "EDICION_USUARIO", entidadId: e.ctx.cajero.usuarioId } });
    expect(JSON.stringify(auditoria.detalle)).toContain("puedeCrearProductos");

    await editarUsuario(e.ctx.admin, e.ctx.cajero.usuarioId, { nombre: "Cajero", rol: "CAJERO", negocios: [e.motos.id] });
    expect((await cargarContexto(e.ctx.cajero.usuarioId))?.puedeCrearProductos).toBe(false);

    // A un socio la casilla no le aplica: no se guarda.
    const socio = await cajeraConPermiso("SOCIO");
    expect(socio.puedeCrearProductos).toBe(false);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: socio.usuarioId } })).puedeCrearProductos).toBe(false);
  });
});
