// Cafeterías: productos que no se cuentan (tinto, jugos), botones rápidos en la caja
// e IVA por defecto de cada negocio.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { abrirCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import { ejecutarImportacion } from "@/lib/datos/importacion";
import { actualizarProducto, ajustarStock, crearProducto } from "@/lib/datos/inventario";
import { guardarPreferenciasVenta, obtenerPreferenciasVenta } from "@/lib/datos/negocios";
import { botonesRapidos, contarStockBajo } from "@/lib/datos/productos";
import { inventarioValorizado } from "@/lib/datos/reportes";
import { anularVenta, registrarVenta, type EntradaVenta } from "@/lib/datos/ventas";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

async function crear(negocioId: string, datos: Record<string, unknown> = {}, stock = "0") {
  const r = await crearProducto(
    e.ctx.admin,
    negocioId,
    esquemaProducto.parse({
      codigo: "TINTO",
      nombre: "Tinto",
      costo: "300",
      precioVenta: "1500",
      stockMinimo: "0",
      unidad: "UNIDAD",
      fraccionado: false,
      porcentajeIva: 0,
      condicion: "NUEVO",
      ...datos,
    }),
    stock,
  );
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

function venta(lineas: EntradaVenta["lineas"], total: number): EntradaVenta {
  return { lineas, totalEsperado: total, pago: { forma: "efectivo", recibido: total } };
}

describe("productos que no se cuentan", () => {
  it("se venden sin stock, sin mover el inventario ni dejar movimientos", async () => {
    const tinto = await crear(e.motos.id, { controlaStock: false });
    await abrirCaja(e.ctx.cajero, e.motos.id, 0);
    const r = await registrarVenta(e.ctx.cajero, e.motos.id, venta([{ productoId: tinto, cantidad: "3" }], 4500));
    expect(r).toMatchObject({ ok: true, total: 4500 });

    const p = await prisma.producto.findUniqueOrThrow({ where: { id: tinto } });
    expect(Number(p.stock)).toBe(0);
    expect(await prisma.movimientoInventario.count({ where: { productoId: tinto } })).toBe(0);
    // La venta guarda el costo del momento: la utilidad sigue saliendo bien.
    expect(await prisma.detalleVenta.findFirstOrThrow({ where: { productoId: tinto } })).toMatchObject({ costoUnitario: 300 });

    // Anular tampoco mueve el stock.
    if (!r.ok) throw new Error();
    expect((await anularVenta(e.ctx.cajero, r.id, "Se equivocó")).ok).toBe(true);
    expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: tinto } })).stock)).toBe(0);
    expect(await prisma.movimientoInventario.count({ where: { productoId: tinto } })).toBe(0);
  });

  it("un producto que sí se cuenta sigue sin poder venderse sin stock", async () => {
    const tinto = await crear(e.motos.id, { controlaStock: false });
    const gaseosa = await crear(e.motos.id, { codigo: "GAS", nombre: "Gaseosa", precioVenta: "3000" });
    await abrirCaja(e.ctx.cajero, e.motos.id, 0);
    const r = await registrarVenta(
      e.ctx.cajero,
      e.motos.id,
      venta([{ productoId: tinto, cantidad: "1" }, { productoId: gaseosa, cantidad: "1" }], 4500),
    );
    expect(r).toMatchObject({ ok: false, error: 'No hay stock de "Gaseosa".' });
    expect(await prisma.venta.count()).toBe(0);
  });

  it("no se ajustan, no cuentan como stock bajo ni en el inventario valorizado", async () => {
    const tinto = await crear(e.motos.id, { controlaStock: false, stockMinimo: "5" }, "10");
    const p = await prisma.producto.findUniqueOrThrow({ where: { id: tinto } });
    expect(Number(p.stock)).toBe(0); // el stock inicial se ignora
    expect(Number(p.stockMinimo)).toBe(0);

    const r = await ajustarStock(e.ctx.admin, tinto, { modo: "nuevo", cantidad: "20", motivo: "CONTEO" });
    expect(r).toMatchObject({ ok: false });
    expect(await contarStockBajo(e.ctx.admin, e.motos.id)).toBe(0);

    // Un producto que tenía stock y se pasa a "no se cuenta" sale del inventario valorizado.
    const gaseosa = await crear(e.motos.id, { codigo: "GAS", nombre: "Gaseosa", precioVenta: "3000", costo: "1800" }, "4");
    expect((await inventarioValorizado(e.ctx.admin, [e.motos.id])).costo).toBe(7200);
    await actualizarProducto(
      e.ctx.admin,
      gaseosa,
      esquemaProducto.parse({
        codigo: "GAS", nombre: "Gaseosa", costo: "1800", precioVenta: "3000", stockMinimo: "0",
        unidad: "UNIDAD", fraccionado: false, porcentajeIva: 0, condicion: "NUEVO", controlaStock: false,
      }),
    );
    expect((await inventarioValorizado(e.ctx.admin, [e.motos.id])).costo).toBe(0);
  });
});

describe("botones rápidos", () => {
  it("solo salen si el negocio los tiene encendidos, y solo los marcados y activos", async () => {
    const tinto = await crear(e.motos.id, { controlaStock: false, botonRapido: true });
    await crear(e.motos.id, { codigo: "GAS", nombre: "Gaseosa", botonRapido: false });
    const viejo = await crear(e.motos.id, { codigo: "VIE", nombre: "Viejo", botonRapido: true });
    await prisma.producto.update({ where: { id: viejo }, data: { activo: false } });

    expect(await botonesRapidos(e.ctx.cajero, e.motos.id)).toEqual([]);

    expect((await guardarPreferenciasVenta(e.ctx.admin, e.motos.id, { ivaPorDefecto: "19", botonesRapidos: true })).ok).toBe(true);
    const botones = await botonesRapidos(e.ctx.cajero, e.motos.id);
    expect(botones.map((b) => b.id)).toEqual([tinto]);
    expect(botones[0]).toMatchObject({ nombre: "Tinto", precioVenta: 1500, controlaStock: false });
    expect(botones[0]).not.toHaveProperty("costo"); // el cajero no ve costos
  });

  it("no se pueden pedir los de un negocio sin permiso ni los de otra empresa", async () => {
    await expect(botonesRapidos(e.ctx.cajero, e.ferreteria.id)).rejects.toThrow(AccesoDenegado);
    await expect(botonesRapidos(e.ctx.adminOtra, e.motos.id)).rejects.toThrow(AccesoDenegado);
  });
});

describe("cómo vende el negocio", () => {
  it("cada negocio guarda su IVA por defecto y sus botones; el cajero no puede cambiarlos", async () => {
    expect(await obtenerPreferenciasVenta(e.ctx.admin, e.motos.id)).toEqual({ ivaPorDefecto: 19, botonesRapidos: false });
    await guardarPreferenciasVenta(e.ctx.admin, e.ferreteria.id, { ivaPorDefecto: "0", botonesRapidos: true });
    expect(await obtenerPreferenciasVenta(e.ctx.admin, e.ferreteria.id)).toEqual({ ivaPorDefecto: 0, botonesRapidos: true });
    // El otro local no cambia.
    expect(await obtenerPreferenciasVenta(e.ctx.admin, e.motos.id)).toEqual({ ivaPorDefecto: 19, botonesRapidos: false });

    expect(await guardarPreferenciasVenta(e.ctx.admin, e.motos.id, { ivaPorDefecto: "8", botonesRapidos: false })).toMatchObject({
      ok: false,
    });
    await expect(guardarPreferenciasVenta(e.ctx.cajero, e.motos.id, { ivaPorDefecto: "0", botonesRapidos: true })).rejects.toThrow();
    await expect(guardarPreferenciasVenta(e.ctx.socio, e.motos.id, { ivaPorDefecto: "0", botonesRapidos: true })).rejects.toThrow(
      AccesoDenegado,
    );
    expect(await prisma.auditoria.count({ where: { accion: "CAMBIO_DATOS_NEGOCIO" } })).toBe(1);
  });
});

describe("importación con columnas de cafetería", () => {
  const csv = (texto: string) => new TextEncoder().encode(texto);

  it("lee Controlar stock y Botón rápido, e ignora el stock de lo que no se cuenta", async () => {
    const archivo = csv(
      "Código,Nombre,Precio de venta,Stock,Controlar stock,Botón rápido\n" +
        "C1,Tinto,1500,99,no,sí\n" +
        "C2,Gaseosa,3000,12,,\n",
    );
    const r = await ejecutarImportacion(e.ctx.admin, e.motos.id, archivo, "menu.csv");
    expect(r).toMatchObject({ ok: true, nuevos: 2 });
    const tinto = await prisma.producto.findFirstOrThrow({ where: { codigo: "C1" } });
    expect(tinto).toMatchObject({ controlaStock: false, botonRapido: true });
    expect(Number(tinto.stock)).toBe(0);
    const gaseosa = await prisma.producto.findFirstOrThrow({ where: { codigo: "C2" } });
    expect(gaseosa).toMatchObject({ controlaStock: true, botonRapido: false });
    expect(Number(gaseosa.stock)).toBe(12);

    // Reimportar sin esas columnas no cambia lo que ya tenían.
    await ejecutarImportacion(e.ctx.admin, e.motos.id, csv("Código,Nombre,Precio de venta\nC1,Tinto grande,2000\n"), "m.csv");
    expect(await prisma.producto.findFirstOrThrow({ where: { codigo: "C1" } })).toMatchObject({
      nombre: "Tinto grande",
      controlaStock: false,
      botonRapido: true,
    });
  });

  it("rechaza un valor que no es sí ni no", async () => {
    const r = await ejecutarImportacion(e.ctx.admin, e.motos.id, csv("Código,Nombre,Precio de venta,Botón rápido\nC1,Tinto,1500,tal vez\n"), "m.csv");
    expect(r.ok).toBe(false);
    expect(r.errores[0].mensaje).toContain("Botón rápido");
  });
});
