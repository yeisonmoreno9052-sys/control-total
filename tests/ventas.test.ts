// CLAUDE.md §9: consecutivos, movimientos de stock y aislamiento en ventas.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { abrirCaja, cerrarCaja, estadoDeCaja, verResumenDeCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import { crearCliente } from "@/lib/datos/clientes";
import type { Contexto } from "@/lib/datos/contexto";
import { crearProducto } from "@/lib/datos/inventario";
import {
  anularVenta,
  listarVentas,
  obtenerVenta,
  registrarDevolucion,
  registrarVenta,
  type EntradaVenta,
} from "@/lib/datos/ventas";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { fechaDeHoy } from "@/lib/formato";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

async function crear(negocioId: string, datos: Record<string, unknown> = {}, stock = "10") {
  const r = await crearProducto(
    e.ctx.admin,
    negocioId,
    esquemaProducto.parse({
      codigo: "TOR-1",
      nombre: "Tornillo 1/4",
      costo: "250",
      precioVenta: "1000",
      stockMinimo: "0",
      unidad: "UNIDAD",
      fraccionado: false,
      porcentajeIva: 19,
      condicion: "NUEVO",
      ...datos,
    }),
    stock,
  );
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

async function abrir(ctx: Contexto, negocioId: string, base = 100000) {
  const r = await abrirCaja(ctx, negocioId, base);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

async function stockDe(id: string) {
  const p = await prisma.producto.findUniqueOrThrow({ where: { id } });
  return Number(p.stock);
}

async function sumaMovimientos(productoId: string) {
  const movs = await prisma.movimientoInventario.findMany({ where: { productoId } });
  return movs.reduce((s, m) => s + Number(m.cantidad), 0);
}

function venta(lineas: EntradaVenta["lineas"], total: number, extra: Partial<EntradaVenta> = {}): EntradaVenta {
  return { lineas, totalEsperado: total, pago: { forma: "efectivo", recibido: total }, ...extra };
}

async function vender(ctx: Contexto, negocioId: string, entrada: EntradaVenta) {
  const r = await registrarVenta(ctx, negocioId, entrada);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("cobrar", () => {
  it("sin caja abierta no se puede vender", async () => {
    const id = await crear(e.motos.id);
    const r = await registrarVenta(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 1000));
    expect(r).toMatchObject({ ok: false, error: "Abre la caja de hoy antes de cobrar." });
  });

  it("guarda la venta, descuenta el stock y deja el movimiento, con precio y costo del momento", async () => {
    const id = await crear(e.motos.id);
    await abrir(e.ctx.cajero, e.motos.id);
    const r = await vender(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "3" }], 3000, {
      pago: { forma: "efectivo", recibido: 5000 },
    }));
    expect(r).toMatchObject({ consecutivo: 1, total: 3000, cambio: 2000 });
    expect(await stockDe(id)).toBe(7);
    expect(await sumaMovimientos(id)).toBe(7);

    // Cambia el precio después: la venta conserva el del momento.
    await prisma.producto.update({ where: { id }, data: { precioVenta: 2000, costo: 900 } });
    const detalle = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: r.id } });
    expect(detalle).toMatchObject({ precioUnitario: 1000, costoUnitario: 250, total: 3000, base: 2521, iva: 479 });
    const guardada = await prisma.venta.findUniqueOrThrow({ where: { id: r.id } });
    expect(guardada).toMatchObject({ total: 3000, base: 2521, iva: 479, recibido: 5000, cambio: 2000, estado: "REGISTRADA" });
  });

  it("no deja vender más de lo que hay, con un mensaje claro", async () => {
    const id = await crear(e.motos.id, {}, "3");
    await abrir(e.ctx.cajero, e.motos.id);
    const r = await registrarVenta(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "2" }, { productoId: id, cantidad: "2" }], 4000));
    expect(r).toMatchObject({ ok: false, error: 'No hay suficiente stock de "Tornillo 1/4": solo quedan 3.' });
    expect(await stockDe(id)).toBe(3);
    expect(await prisma.venta.count()).toBe(0);
  });

  it("productos fraccionados aceptan decimales; los de unidad no", async () => {
    const cable = await crear(e.motos.id, { codigo: "CAB", nombre: "Cable", unidad: "METRO", fraccionado: true, precioVenta: "1800" }, "100");
    const tornillo = await crear(e.motos.id, {}, "10");
    await abrir(e.ctx.cajero, e.motos.id);
    await vender(e.ctx.cajero, e.motos.id, venta([{ productoId: cable, cantidad: "2,5" }], 4500));
    expect(await stockDe(cable)).toBe(97.5);
    const r = await registrarVenta(e.ctx.cajero, e.motos.id, venta([{ productoId: tornillo, cantidad: "1,5" }], 1500));
    expect(r.ok).toBe(false);
  });

  it("si el total que vio el cajero no coincide (cambió el precio), no cobra", async () => {
    const id = await crear(e.motos.id);
    await abrir(e.ctx.cajero, e.motos.id);
    const r = await registrarVenta(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 900));
    expect(r.ok).toBe(false);
    expect(await stockDe(id)).toBe(10);
  });

  it("descuentos y pago mixto", async () => {
    const id = await crear(e.motos.id, { precioVenta: "10000" });
    await abrir(e.ctx.cajero, e.motos.id);
    const r = await vender(e.ctx.cajero, e.motos.id, {
      lineas: [{ productoId: id, cantidad: "2", descuento: { tipo: "porcentaje", valor: 10 } }],
      descuentoGeneral: { tipo: "pesos", valor: 1000 },
      totalEsperado: 17000,
      pago: { forma: "mixto", transferencia: 10000, recibido: 10000 },
    });
    expect(r.cambio).toBe(3000);
    const pagos = await prisma.pagoVenta.findMany({ where: { ventaId: r.id }, orderBy: { medio: "asc" } });
    expect(pagos.map((p) => [p.medio, p.valor])).toEqual([["EFECTIVO", 7000], ["TRANSFERENCIA", 10000]]);
    expect(await prisma.venta.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ subtotal: 20000, descuento: 3000, total: 17000 });
  });

  it("el cliente debe ser del mismo negocio", async () => {
    const id = await crear(e.motos.id);
    const otro = await crearCliente(e.ctx.socio, e.ferreteria.id, { nombre: "Cliente ferretería" });
    if (!otro.ok) throw new Error();
    await abrir(e.ctx.cajero, e.motos.id);
    const r = await registrarVenta(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 1000, { clienteId: otro.id }));
    expect(r.ok).toBe(false);
  });
});

describe("consecutivos", () => {
  it("20 ventas al mismo tiempo reciben números seguidos, sin huecos ni repetidos; cada negocio lleva el suyo", async () => {
    const motos = await crear(e.motos.id, {}, "100");
    const ferre = await crear(e.ferreteria.id, {}, "100");
    await abrir(e.ctx.admin, e.motos.id);
    await abrir(e.ctx.admin, e.ferreteria.id);
    const resultados = await Promise.all([
      ...Array.from({ length: 20 }, () => registrarVenta(e.ctx.admin, e.motos.id, venta([{ productoId: motos, cantidad: "1" }], 1000))),
      ...Array.from({ length: 5 }, () => registrarVenta(e.ctx.admin, e.ferreteria.id, venta([{ productoId: ferre, cantidad: "1" }], 1000))),
    ]);
    expect(resultados.every((r) => r.ok)).toBe(true);
    const nums = async (negocioId: string) =>
      (await prisma.venta.findMany({ where: { negocioId }, orderBy: { consecutivo: "asc" } })).map((v) => v.consecutivo);
    expect(await nums(e.motos.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(await nums(e.ferreteria.id)).toEqual([1, 2, 3, 4, 5]);
    expect(await stockDe(motos)).toBe(80);
  });

  it("una venta que falla no gasta número", async () => {
    const id = await crear(e.motos.id, {}, "1");
    await abrir(e.ctx.admin, e.motos.id);
    await registrarVenta(e.ctx.admin, e.motos.id, venta([{ productoId: id, cantidad: "5" }], 5000));
    const r = await vender(e.ctx.admin, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 1000));
    expect(r.consecutivo).toBe(1);
  });
});

describe("dos ventas del último producto al mismo tiempo", () => {
  it("una se cobra, la otra recibe 'no hay stock' y el stock nunca queda negativo", async () => {
    const id = await crear(e.motos.id, {}, "1");
    await abrir(e.ctx.admin, e.motos.id);
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () => registrarVenta(e.ctx.admin, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 1000))),
    );
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.filter((r) => !r.ok).every((r) => !r.ok && r.error.includes("No hay stock"))).toBe(true);
    expect(await stockDe(id)).toBe(0);
    expect(await sumaMovimientos(id)).toBe(0);
  });
});

describe("anular", () => {
  it("devuelve el stock, no modifica la venta original y queda en auditoría", async () => {
    const id = await crear(e.motos.id);
    await abrir(e.ctx.cajero, e.motos.id);
    const v = await vender(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "4" }], 4000));
    expect(await anularVenta(e.ctx.cajero, v.id, "")).toMatchObject({ ok: false });
    expect(await anularVenta(e.ctx.cajero, v.id, "El cliente se arrepintió")).toMatchObject({ ok: true });
    expect(await stockDe(id)).toBe(10);
    expect(await sumaMovimientos(id)).toBe(10);
    const guardada = await prisma.venta.findUniqueOrThrow({ where: { id: v.id } });
    expect(guardada).toMatchObject({ estado: "ANULADA", total: 4000, consecutivo: 1, motivoAnulacion: "El cliente se arrepintió" });
    expect(await prisma.detalleVenta.count({ where: { ventaId: v.id } })).toBe(1);
    const auditoria = await prisma.auditoria.findFirstOrThrow({ where: { accion: "ANULACION_VENTA" } });
    expect(auditoria.usuarioId).toBe(e.ctx.cajero.usuarioId);
    // No se anula dos veces.
    expect(await anularVenta(e.ctx.admin, v.id, "Otra vez")).toMatchObject({ ok: false });
    expect(await stockDe(id)).toBe(10);
  });

  it("el cajero no anula ventas de días anteriores; el administrador sí", async () => {
    const id = await crear(e.motos.id);
    const cajaId = await abrir(e.ctx.cajero, e.motos.id);
    const v = await vender(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 1000));
    // Se simula que la venta fue ayer: la caja pasa a ayer (cerrada) y se abre la de hoy.
    const ayer = new Date(fechaDeHoy().getTime() - 86400000);
    await prisma.caja.update({ where: { id: cajaId }, data: { fecha: ayer, estado: "CERRADA" } });
    await abrir(e.ctx.cajero, e.motos.id);
    expect(await anularVenta(e.ctx.cajero, v.id, "Error")).toMatchObject({ ok: false });
    expect(await anularVenta(e.ctx.admin, v.id, "Error")).toMatchObject({ ok: true });
  });
});

describe("devoluciones", () => {
  it("parcial y luego el resto: el stock vuelve, el dinero cuadra y la venta original no cambia", async () => {
    const id = await crear(e.motos.id, { precioVenta: "1000" });
    await abrir(e.ctx.cajero, e.motos.id);
    const v = await vender(e.ctx.cajero, e.motos.id, {
      lineas: [{ productoId: id, cantidad: "3" }],
      descuentoGeneral: { tipo: "pesos", valor: 100 },
      totalEsperado: 2900,
      pago: { forma: "efectivo", recibido: 2900 },
    });
    const detalle = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: v.id } });

    const d1 = await registrarDevolucion(e.ctx.cajero, v.id, { lineas: [{ detalleVentaId: detalle.id, cantidad: "1" }], motivo: "Defectuoso", medio: "EFECTIVO" });
    expect(d1).toMatchObject({ ok: true, consecutivo: 1, total: 967 });
    expect(await stockDe(id)).toBe(8);

    const demasiado = await registrarDevolucion(e.ctx.cajero, v.id, { lineas: [{ detalleVentaId: detalle.id, cantidad: "3" }], motivo: "x x", medio: "EFECTIVO" });
    expect(demasiado).toMatchObject({ ok: false, error: "Tornillo 1/4: solo se pueden devolver 2." });

    const d2 = await registrarDevolucion(e.ctx.cajero, v.id, { lineas: [{ detalleVentaId: detalle.id, cantidad: "2" }], motivo: "Defectuoso", medio: "EFECTIVO" });
    expect(d2).toMatchObject({ ok: true, consecutivo: 2, total: 2900 - 967 });
    expect(await stockDe(id)).toBe(10);
    expect(await sumaMovimientos(id)).toBe(10);
    expect(await prisma.venta.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({ total: 2900, estado: "CON_DEVOLUCION" });
    // Con devolución ya no se anula.
    expect(await anularVenta(e.ctx.cajero, v.id, "Error")).toMatchObject({ ok: false });
  });
});

describe("cierre de caja", () => {
  it("esperado = base + efectivo de ventas − anulaciones − devoluciones en efectivo; el cajero cierra a ciegas", async () => {
    const id = await crear(e.motos.id, { precioVenta: "10000" }, "100");
    const cajaId = await abrir(e.ctx.cajero, e.motos.id, 50000);
    await vender(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "3" }], 30000)); // +30.000 efectivo
    await vender(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "2" }], 20000, { pago: { forma: "transferencia" } }));
    const anulada = await vender(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 10000)); // +10.000 −10.000
    await anularVenta(e.ctx.cajero, anulada.id, "Error de digitación");
    const conDevolucion = await vender(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 10000)); // +10.000
    const detalle = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: conDevolucion.id } });
    await registrarDevolucion(e.ctx.cajero, conDevolucion.id, { lineas: [{ detalleVentaId: detalle.id, cantidad: "1" }], motivo: "No sirvió", medio: "EFECTIVO" }); // −10.000

    const resumen = await verResumenDeCaja(e.ctx.admin, cajaId);
    expect(resumen).toMatchObject({ base: 50000, ventasEfectivo: 50000, ventasTransferencia: 20000, anulacionesEfectivo: 10000, devolucionesEfectivo: 10000, esperado: 80000 });
    await expect(verResumenDeCaja(e.ctx.cajero, cajaId)).rejects.toBeInstanceOf(AccesoDenegado);

    const cierre = await cerrarCaja(e.ctx.cajero, cajaId, 79000, null);
    expect(cierre).toMatchObject({ ok: true, esperado: null, diferencia: null }); // a ciegas
    expect(await prisma.caja.findUniqueOrThrow({ where: { id: cajaId } })).toMatchObject({ estado: "CERRADA", esperado: 80000, contado: 79000, diferencia: -1000 });

    // Con la caja cerrada ya no se vende.
    const r = await registrarVenta(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 10000));
    expect(r.ok).toBe(false);
    expect(await abrirCaja(e.ctx.cajero, e.motos.id, 0)).toMatchObject({ ok: false, error: "La caja de hoy ya se cerró." });
  });

  it("no se abre la caja de hoy si quedó una de otro día sin cerrar", async () => {
    const cajaId = await abrir(e.ctx.cajero, e.motos.id);
    await prisma.caja.update({ where: { id: cajaId }, data: { fecha: new Date(fechaDeHoy().getTime() - 86400000) } });
    expect(await abrirCaja(e.ctx.cajero, e.motos.id, 0)).toMatchObject({ ok: false });
    const estado = await estadoDeCaja(e.ctx.cajero, e.motos.id);
    expect(estado.pendiente?.id).toBe(cajaId);
  });
});

describe("aislamiento", () => {
  it("el socio de la ferretería no ve, no vende ni anula en motos", async () => {
    const id = await crear(e.motos.id);
    await abrir(e.ctx.cajero, e.motos.id);
    const v = await vender(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 1000));
    await expect(listarVentas(e.ctx.socio, e.motos.id)).rejects.toBeInstanceOf(AccesoDenegado);
    expect(await obtenerVenta(e.ctx.socio, v.id)).toBeNull();
    expect(await anularVenta(e.ctx.socio, v.id, "Intento")).toMatchObject({ ok: false, error: "No encontramos esa venta." });
    await expect(registrarVenta(e.ctx.socio, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 1000))).rejects.toBeInstanceOf(AccesoDenegado);
    // Vender en su negocio un producto de motos tampoco.
    await abrir(e.ctx.socio, e.ferreteria.id);
    const r = await registrarVenta(e.ctx.socio, e.ferreteria.id, venta([{ productoId: id, cantidad: "1" }], 1000));
    expect(r.ok).toBe(false);
    expect(await stockDe(id)).toBe(9);
  });

  it("otra empresa no ve nada", async () => {
    const id = await crear(e.motos.id);
    await abrir(e.ctx.admin, e.motos.id);
    const v = await vender(e.ctx.admin, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 1000));
    expect(await obtenerVenta(e.ctx.adminOtra, v.id)).toBeNull();
    await expect(listarVentas(e.ctx.adminOtra, e.motos.id)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("el cajero no ve el costo en el detalle de la venta", async () => {
    const id = await crear(e.motos.id);
    await abrir(e.ctx.cajero, e.motos.id);
    const v = await vender(e.ctx.cajero, e.motos.id, venta([{ productoId: id, cantidad: "1" }], 1000));
    expect((await obtenerVenta(e.ctx.cajero, v.id))!.detalles[0].costoUnitario).toBeNull();
    expect((await obtenerVenta(e.ctx.admin, v.id))!.detalles[0].costoUnitario).toBe(250);
  });
});
