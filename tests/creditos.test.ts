// Ventas a crédito (fiado): la deuda sale de las ventas, devoluciones y abonos,
// los abonos en efectivo entran a la caja y lo fiado no.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { abrirCaja, cerrarCaja, verResumenDeCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import { crearCliente } from "@/lib/datos/clientes";
import type { Contexto } from "@/lib/datos/contexto";
import { anularAbono, cuentaDeCliente, listarDeudores, registrarAbono, saldoDeCliente } from "@/lib/datos/creditos";
import { crearProducto } from "@/lib/datos/inventario";
import { anularVenta, obtenerVenta, registrarDevolucion, registrarVenta } from "@/lib/datos/ventas";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { textoWhatsApp } from "@/lib/ventas/recibo";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
let producto: string;
let juan: string;
let cajaId: string;

beforeEach(async () => {
  e = await crearEscenario();
  await prisma.negocio.update({ where: { id: e.motos.id }, data: { permiteCredito: true } });
  const p = await crearProducto(
    e.ctx.admin,
    e.motos.id,
    esquemaProducto.parse({
      codigo: "EMP",
      nombre: "Empanada",
      costo: "1000",
      precioVenta: "3000",
      stockMinimo: "0",
      unidad: "UNIDAD",
      fraccionado: false,
      porcentajeIva: 0,
      condicion: "NUEVO",
    }),
    "20",
  );
  if (!p.ok) throw new Error(p.error);
  producto = p.id;
  const c = await crearCliente(e.ctx.cajero, e.motos.id, { nombre: "Juan Pérez", telefono: "3001234567" });
  if (!c.ok) throw new Error(c.error);
  juan = c.id;
  const caja = await abrirCaja(e.ctx.cajero, e.motos.id, 50000);
  if (!caja.ok) throw new Error(caja.error);
  cajaId = caja.id;
});

afterAll(() => prisma.$disconnect());

async function fiar(ctx: Contexto, cantidad: number, clienteId: string | null = juan) {
  return registrarVenta(ctx, e.motos.id, {
    lineas: [{ productoId: producto, cantidad: String(cantidad) }],
    totalEsperado: cantidad * 3000,
    clienteId,
    pago: { forma: "credito" },
  });
}

describe("fiar", () => {
  it("el cajero fía: baja el stock, sube la deuda y no entra plata a la caja", async () => {
    const r = await fiar(e.ctx.cajero, 2);
    expect(r.ok).toBe(true);
    expect(await saldoDeCliente(e.ctx.cajero, e.motos.id, juan)).toBe(6000);
    const p = await prisma.producto.findUniqueOrThrow({ where: { id: producto } });
    expect(Number(p.stock)).toBe(18);
    const resumen = await verResumenDeCaja(e.ctx.admin, cajaId);
    expect(resumen?.ventasCredito).toBe(6000);
    expect(resumen?.esperado).toBe(50000);
  });

  it("no se fía sin cliente ni en un negocio que no lo tiene activado", async () => {
    const sin = await fiar(e.ctx.cajero, 1, null);
    expect(sin).toMatchObject({ ok: false, error: "Para fiar, elige a quién le fías." });
    await prisma.negocio.update({ where: { id: e.motos.id }, data: { permiteCredito: false } });
    const apagado = await fiar(e.ctx.cajero, 1);
    expect(apagado.ok).toBe(false);
    expect(await prisma.venta.count()).toBe(0);
  });

  it("anular una venta fiada borra esa deuda sin sacar plata de la caja", async () => {
    const r = await fiar(e.ctx.cajero, 2);
    if (!r.ok) throw new Error(r.error);
    expect((await anularVenta(e.ctx.cajero, r.id, "Se equivocó")).ok).toBe(true);
    expect(await saldoDeCliente(e.ctx.admin, e.motos.id, juan)).toBe(0);
    expect((await verResumenDeCaja(e.ctx.admin, cajaId))?.esperado).toBe(50000);
  });

  it("la devolución de una venta fiada baja la deuda, no sale de la caja", async () => {
    const r = await fiar(e.ctx.cajero, 3);
    if (!r.ok) throw new Error(r.error);
    const v = await obtenerVenta(e.ctx.admin, r.id);
    const d = await registrarDevolucion(e.ctx.cajero, r.id, {
      lineas: [{ detalleVentaId: v!.detalles[0].id, cantidad: "1" }],
      motivo: "Llegó fría",
      medio: "EFECTIVO",
    });
    expect(d.ok).toBe(true);
    const dev = await prisma.devolucion.findFirstOrThrow();
    expect(dev.medio).toBe("CREDITO");
    expect(await saldoDeCliente(e.ctx.admin, e.motos.id, juan)).toBe(6000);
    expect((await verResumenDeCaja(e.ctx.admin, cajaId))?.esperado).toBe(50000);
  });
});

describe("abonos", () => {
  it("el abono en efectivo baja la deuda y entra a la caja; por transferencia no", async () => {
    await fiar(e.ctx.cajero, 4);
    const a = await registrarAbono(e.ctx.cajero, e.motos.id, juan, { valor: 5000, medio: "EFECTIVO" });
    expect(a).toMatchObject({ ok: true, debe: 7000 });
    const t = await registrarAbono(e.ctx.cajero, e.motos.id, juan, { valor: 2000, medio: "TRANSFERENCIA" });
    expect(t).toMatchObject({ ok: true, debe: 5000 });
    const resumen = await verResumenDeCaja(e.ctx.admin, cajaId);
    expect(resumen?.abonosEfectivo).toBe(5000);
    expect(resumen?.abonosTransferencia).toBe(2000);
    expect(resumen?.esperado).toBe(55000);
    const auditoria = await prisma.auditoria.count({ where: { accion: "ABONO_CREDITO" } });
    expect(auditoria).toBe(2);
  });

  it("no deja abonar más de lo que se debe", async () => {
    await fiar(e.ctx.cajero, 1);
    const r = await registrarAbono(e.ctx.cajero, e.motos.id, juan, { valor: 5000, medio: "EFECTIVO" });
    expect(r.ok).toBe(false);
    expect(await saldoDeCliente(e.ctx.admin, e.motos.id, juan)).toBe(3000);
  });

  it("sin caja abierta no se reciben abonos en efectivo", async () => {
    await fiar(e.ctx.cajero, 1);
    await cerrarCaja(e.ctx.admin, cajaId, 50000, null);
    const r = await registrarAbono(e.ctx.cajero, e.motos.id, juan, { valor: 1000, medio: "EFECTIVO" });
    expect(r).toMatchObject({ ok: false, error: "Abre la caja de hoy para recibir abonos en efectivo." });
  });

  it("solo el administrador anula un abono, y vuelve a la deuda", async () => {
    await fiar(e.ctx.cajero, 2);
    const a = await registrarAbono(e.ctx.cajero, e.motos.id, juan, { valor: 6000, medio: "EFECTIVO" });
    if (!a.ok) throw new Error(a.error);
    await expect(anularAbono(e.ctx.cajero, a.id, "error")).rejects.toThrow();
    expect((await anularAbono(e.ctx.admin, a.id, "Lo anoté dos veces")).ok).toBe(true);
    expect(await saldoDeCliente(e.ctx.admin, e.motos.id, juan)).toBe(6000);
    expect((await verResumenDeCaja(e.ctx.admin, cajaId))?.esperado).toBe(50000);
  });

  it("lista de deudores y cuenta del cliente", async () => {
    await fiar(e.ctx.cajero, 2);
    await registrarAbono(e.ctx.cajero, e.motos.id, juan, { valor: 1000, medio: "EFECTIVO" });
    const { deudores, totalDebe } = await listarDeudores(e.ctx.cajero, e.motos.id);
    expect(deudores).toHaveLength(1);
    expect(deudores[0]).toMatchObject({ nombre: "Juan Pérez", debe: 5000, abonado: 1000 });
    expect(totalDebe).toBe(5000);
    const cuenta = await cuentaDeCliente(e.ctx.cajero, e.motos.id, juan);
    expect(cuenta?.debe).toBe(5000);
    expect(cuenta?.movimientos.map((m) => m.tipo).sort()).toEqual(["abono", "venta"]);
  });
});

describe("aislamiento", () => {
  it("otra empresa y otro negocio no ven ni abonan deudas ajenas", async () => {
    await fiar(e.ctx.cajero, 2);
    await expect(listarDeudores(e.ctx.adminOtra, e.motos.id)).rejects.toThrow();
    await expect(listarDeudores(e.ctx.socio, e.motos.id)).rejects.toThrow();
    const r = await registrarAbono(e.ctx.adminOtra, e.motos.id, juan, { valor: 1000, medio: "EFECTIVO" }).catch(() => null);
    expect(r?.ok ?? false).toBe(false);
    expect(await saldoDeCliente(e.ctx.admin, e.motos.id, juan)).toBe(6000);
  });
});

describe("recibo", () => {
  it("el recibo de WhatsApp muestra el saldo pendiente", () => {
    const texto = textoWhatsApp(
      {
        consecutivo: 1,
        creadoEn: new Date(),
        total: 6000,
        descuento: 0,
        cambio: null,
        estado: "REGISTRADA",
        detalles: [],
        pagos: [{ medio: "CREDITO", valor: 6000 }],
      },
      "Club",
      null,
      9000,
    );
    expect(texto).toContain("Crédito (fiado): $ 6.000");
    expect(texto).toContain("Saldo pendiente: $ 9.000");
  });
});
