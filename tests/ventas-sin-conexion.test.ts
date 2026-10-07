// Ventas hechas sin internet que se suben al volver la conexión.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { abrirCaja, cerrarCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import { actualizarProducto, crearProducto } from "@/lib/datos/inventario";
import { catalogoCaja } from "@/lib/datos/productos";
import { registrarVenta } from "@/lib/datos/ventas";
import { subirVentaSinConexion, type VentaSinConexion } from "@/lib/datos/ventas-sin-conexion";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { diaEnBogota, fechaDeHoy } from "@/lib/formato";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

const datosProducto = {
  codigo: "TOR-1",
  nombre: "Tornillo 1/4",
  costo: "250",
  precioVenta: "1000",
  stockMinimo: "0",
  unidad: "UNIDAD",
  fraccionado: false,
  porcentajeIva: 19,
  condicion: "NUEVO",
};

async function crear(negocioId: string, datos: Record<string, unknown> = {}, stock = "10") {
  const r = await crearProducto(e.ctx.admin, negocioId, esquemaProducto.parse({ ...datosProducto, ...datos }), stock);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

let n = 0;
function venta(productoId: string, cantidad: string, precio = 1000, extra: Partial<VentaSinConexion> = {}): VentaSinConexion {
  n += 1;
  const total = precio * Number(cantidad);
  return {
    idLocal: `local-${n}-${Date.now()}`,
    numeroProvisional: `P-${String(n).padStart(4, "0")}`,
    creadaEn: new Date().toISOString(),
    lineas: [{ productoId, cantidad, precioUnitario: precio, porcentajeIva: 19 }],
    pago: { forma: "efectivo", recibido: total },
    total,
    ...extra,
  };
}

async function stockDe(id: string) {
  return Number((await prisma.producto.findUniqueOrThrow({ where: { id } })).stock);
}

describe("subir ventas hechas sin internet", () => {
  it("queda registrada con número definitivo y marcada sin conexión", async () => {
    const p = await crear(e.motos.id);
    await abrirCaja(e.ctx.cajero, e.motos.id, 50000);
    const r = await subirVentaSinConexion(e.ctx.cajero, e.motos.id, venta(p, "3"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.consecutivo).toBe(1);
    expect(r.nota).toBeNull();
    const v = await prisma.venta.findUniqueOrThrow({ where: { id: r.id } });
    expect(v).toMatchObject({ sinConexion: true, numeroProvisional: "P-0001", total: 3000, usuarioId: e.ctx.cajero.usuarioId });
    expect(await stockDe(p)).toBe(7);
  });

  it("subirla dos veces no la duplica, ni al mismo tiempo", async () => {
    const p = await crear(e.motos.id);
    await abrirCaja(e.ctx.cajero, e.motos.id, 0);
    const v = venta(p, "2");
    const [a, b] = await Promise.all([
      subirVentaSinConexion(e.ctx.cajero, e.motos.id, v),
      subirVentaSinConexion(e.ctx.cajero, e.motos.id, v),
    ]);
    const c = await subirVentaSinConexion(e.ctx.cajero, e.motos.id, v);
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    expect(new Set([a.id, b.id, c.id]).size).toBe(1);
    expect(c.yaExistia).toBe(true);
    expect(await prisma.venta.count()).toBe(1);
    expect(await stockDe(p)).toBe(8);
  });

  it("los números quedan seguidos mezclando ventas en línea y sin internet", async () => {
    const p = await crear(e.motos.id, {}, "100");
    await abrirCaja(e.ctx.cajero, e.motos.id, 0);
    const enLinea = () =>
      registrarVenta(e.ctx.cajero, e.motos.id, {
        lineas: [{ productoId: p, cantidad: "1" }],
        totalEsperado: 1000,
        pago: { forma: "efectivo", recibido: 1000 },
      });
    const resultados = await Promise.all([
      enLinea(),
      subirVentaSinConexion(e.ctx.cajero, e.motos.id, venta(p, "1")),
      enLinea(),
      subirVentaSinConexion(e.ctx.cajero, e.motos.id, venta(p, "1")),
      subirVentaSinConexion(e.ctx.admin, e.motos.id, venta(p, "1")),
    ]);
    expect(resultados.every((r) => r.ok)).toBe(true);
    const numeros = (await prisma.venta.findMany({ select: { consecutivo: true } })).map((v) => v.consecutivo).sort();
    expect(numeros).toEqual([1, 2, 3, 4, 5]);
  });

  it("respeta el precio cobrado aunque haya cambiado y lo anota", async () => {
    const p = await crear(e.motos.id);
    await abrirCaja(e.ctx.cajero, e.motos.id, 0);
    await actualizarProducto(e.ctx.admin, p, esquemaProducto.parse({ ...datosProducto, precioVenta: "1500" }));
    const r = await subirVentaSinConexion(e.ctx.cajero, e.motos.id, venta(p, "2", 1000));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nota).toMatch(/otro precio/);
    const v = await prisma.venta.findUniqueOrThrow({ where: { id: r.id } });
    expect(v.total).toBe(2000);
    const auditoria = await prisma.auditoria.findFirst({ where: { accion: "VENTA_SIN_CONEXION", entidadId: r.id } });
    expect(auditoria).not.toBeNull();
  });

  it("rechaza un total que no cuadra con los productos", async () => {
    const p = await crear(e.motos.id);
    await abrirCaja(e.ctx.cajero, e.motos.id, 0);
    const r = await subirVentaSinConexion(e.ctx.cajero, e.motos.id, { ...venta(p, "2"), total: 500 });
    expect(r).toMatchObject({ ok: false, reintentar: false });
  });

  it("acepta vender más de lo que había: el stock queda en negativo y se anota", async () => {
    const p = await crear(e.motos.id, {}, "2");
    await abrirCaja(e.ctx.cajero, e.motos.id, 0);
    const r = await subirVentaSinConexion(e.ctx.cajero, e.motos.id, venta(p, "5"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nota).toMatch(/negativo/);
    expect(await stockDe(p)).toBe(-3);
    const movs = await prisma.movimientoInventario.findMany({ where: { productoId: p } });
    expect(movs.reduce((s, m) => s + Number(m.cantidad), 0)).toBe(-3);
  });

  it("guarda la fecha real de la venta", async () => {
    const p = await crear(e.motos.id);
    await abrirCaja(e.ctx.cajero, e.motos.id, 0);
    const hace = new Date(Date.now() - 40 * 60 * 1000);
    const r = await subirVentaSinConexion(e.ctx.cajero, e.motos.id, venta(p, "1", 1000, { creadaEn: hace.toISOString() }));
    if (!r.ok) throw new Error(r.error);
    const v = await prisma.venta.findUniqueOrThrow({ where: { id: r.id } });
    expect(v.creadoEn.getTime()).toBe(hace.getTime());
    const futura = await subirVentaSinConexion(
      e.ctx.cajero,
      e.motos.id,
      venta(p, "1", 1000, { creadaEn: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() }),
    );
    expect(futura.ok).toBe(false);
  });
});

describe("caja de las ventas sin internet", () => {
  it("si no se había abierto caja, se abre sola con base 0", async () => {
    const p = await crear(e.motos.id);
    const r = await subirVentaSinConexion(e.ctx.cajero, e.motos.id, venta(p, "1"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nota).toMatch(/se abrió sola/);
    const caja = await prisma.caja.findFirstOrThrow({ where: { negocioId: e.motos.id } });
    expect(caja).toMatchObject({ base: 0, estado: "ABIERTA" });
    expect(caja.fecha.getTime()).toBe(fechaDeHoy().getTime());
  });

  it("venta de ayer con la caja de ayer abierta entra en esa; si ya se cerró, entra en la de hoy", async () => {
    const p = await crear(e.motos.id);
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const fechaAyer = new Date(`${diaEnBogota(ayer)}T00:00:00.000Z`);
    const cajaAyer = await prisma.caja.create({
      data: { empresaId: e.camila.id, negocioId: e.motos.id, fecha: fechaAyer, base: 0, abiertaPorId: e.ctx.admin.usuarioId },
    });
    const r1 = await subirVentaSinConexion(e.ctx.cajero, e.motos.id, venta(p, "1", 1000, { creadaEn: ayer.toISOString() }));
    if (!r1.ok) throw new Error(r1.error);
    expect((await prisma.venta.findUniqueOrThrow({ where: { id: r1.id } })).cajaId).toBe(cajaAyer.id);

    await cerrarCaja(e.ctx.admin, cajaAyer.id, 1000, null);
    const hoy = await abrirCaja(e.ctx.cajero, e.motos.id, 0);
    if (!hoy.ok) throw new Error(hoy.error);
    const r2 = await subirVentaSinConexion(e.ctx.cajero, e.motos.id, venta(p, "1", 1000, { creadaEn: ayer.toISOString() }));
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.nota).toMatch(/ya estaba cerrada/);
    expect((await prisma.venta.findUniqueOrThrow({ where: { id: r2.id } })).cajaId).toBe(hoy.id);
  });

  it("si la caja de hoy ya se cerró, queda pendiente para reintentar", async () => {
    const p = await crear(e.motos.id);
    const caja = await abrirCaja(e.ctx.admin, e.motos.id, 0);
    if (!caja.ok) throw new Error(caja.error);
    await cerrarCaja(e.ctx.admin, caja.id, 0, null);
    const r = await subirVentaSinConexion(e.ctx.cajero, e.motos.id, venta(p, "1"));
    expect(r).toMatchObject({ ok: false, reintentar: true });
    expect(await stockDe(p)).toBe(10);
  });
});

describe("permisos", () => {
  it("un cajero no sube ventas a otro negocio ni con productos de otro negocio", async () => {
    const motos = await crear(e.motos.id);
    const ferre = await crear(e.ferreteria.id, { codigo: "F-1" });
    await expect(subirVentaSinConexion(e.ctx.cajero, e.ferreteria.id, venta(ferre, "1"))).rejects.toThrow(AccesoDenegado);
    await abrirCaja(e.ctx.socio, e.ferreteria.id, 0);
    const cruzada = await subirVentaSinConexion(e.ctx.socio, e.ferreteria.id, venta(motos, "1"));
    expect(cruzada.ok).toBe(false);
    expect(await stockDe(motos)).toBe(10);
  });

  it("otra empresa no puede subir ni reclamar ventas de este negocio", async () => {
    const p = await crear(e.motos.id);
    await expect(subirVentaSinConexion(e.ctx.adminOtra, e.motos.id, venta(p, "1"))).rejects.toThrow(AccesoDenegado);
  });

  it("solo un administrador sube ventas que hizo otra persona, y quedan a nombre de quien vendió", async () => {
    const p = await crear(e.motos.id);
    await abrirCaja(e.ctx.admin, e.motos.id, 0);
    const delCajero = venta(p, "1", 1000, { vendedorId: e.ctx.cajero.usuarioId });
    const r = await subirVentaSinConexion(e.ctx.admin, e.motos.id, delCajero);
    if (!r.ok) throw new Error(r.error);
    expect((await prisma.venta.findUniqueOrThrow({ where: { id: r.id } })).usuarioId).toBe(e.ctx.cajero.usuarioId);
    const ajena = await subirVentaSinConexion(e.ctx.cajero, e.motos.id, venta(p, "1", 1000, { vendedorId: e.ctx.admin.usuarioId }));
    expect(ajena).toMatchObject({ ok: false, reintentar: true });
  });

  it("la copia de productos no tiene costos y solo trae el negocio pedido", async () => {
    const p = await crear(e.motos.id);
    await crear(e.ferreteria.id, { codigo: "F-1" });
    const c = await catalogoCaja(e.ctx.cajero, e.motos.id, null);
    expect(c.productos.map((x) => x.id)).toEqual([p]);
    expect(c.productos[0]).not.toHaveProperty("costo");
    await expect(catalogoCaja(e.ctx.cajero, e.ferreteria.id, null)).rejects.toThrow(AccesoDenegado);
    // Lo que cambió después: solo ese producto.
    const desde = new Date(c.hasta);
    expect((await catalogoCaja(e.ctx.cajero, e.motos.id, desde)).productos).toHaveLength(0);
    await actualizarProducto(e.ctx.admin, p, esquemaProducto.parse({ ...datosProducto, precioVenta: "1200" }));
    expect((await catalogoCaja(e.ctx.cajero, e.motos.id, desde)).productos[0].precioVenta).toBe(1200);
  });
});
