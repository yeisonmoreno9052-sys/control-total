// Fase 4: utilidad, reportes de ventas y aislamiento (CLAUDE.md §9).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { abrirCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import type { Contexto } from "@/lib/datos/contexto";
import { crearProducto } from "@/lib/datos/inventario";
import { registrarMovimientoCaja } from "@/lib/datos/movimientos-caja";
import {
  esResponsableIva,
  gastosDelPeriodo,
  inventarioValorizado,
  negociosDelReporte,
  productosSinVentas,
  productosVendidos,
  resumenVentas,
  stockBajo,
  utilidadDelPeriodo,
  ventasPorCajero,
  ventasPorDia,
  ventasPorMedio,
} from "@/lib/datos/reportes";
import ExcelJS from "exceljs";
import { armarReporte } from "@/lib/reportes/armar";
import { reporteAExcel } from "@/lib/reportes/excel";
import { calcularPeriodo } from "@/lib/reportes/periodos";
import { anularVenta, registrarDevolucion, registrarVenta } from "@/lib/datos/ventas";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { diaEnBogota } from "@/lib/formato";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
let A: string; // motos: costo 250, precio 1.000, IVA 19 %
let B: string; // ferretería: costo 600, precio 1.000, sin IVA
const hoy = () => diaEnBogota();

async function producto(negocioId: string, datos: Record<string, unknown>, stock: string) {
  const r = await crearProducto(
    e.ctx.admin,
    negocioId,
    esquemaProducto.parse({
      stockMinimo: "0",
      unidad: "UNIDAD",
      fraccionado: false,
      condicion: "NUEVO",
      ...datos,
    }),
    stock,
  );
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

async function vender(negocioId: string, productoId: string, cantidad: number, ctx: Contexto = e.ctx.admin) {
  const total = cantidad * 1000;
  const r = await registrarVenta(ctx, negocioId, {
    lineas: [{ productoId, cantidad: String(cantidad) }],
    totalEsperado: total,
    pago: { forma: "efectivo", recibido: total },
  });
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

beforeEach(async () => {
  e = await crearEscenario();
  await prisma.negocio.update({ where: { id: e.motos.id }, data: { regimen: "Responsable de IVA" } });
  await prisma.negocio.update({ where: { id: e.ferreteria.id }, data: { regimen: "No responsable de IVA" } });
  A = await producto(e.motos.id, { codigo: "A", nombre: "Bujía", costo: "250", precioVenta: "1000", porcentajeIva: 19 }, "20");
  B = await producto(
    e.ferreteria.id,
    { codigo: "B", nombre: "Brocha", costo: "600", precioVenta: "1000", porcentajeIva: 0 },
    "20",
  );
  await abrirCaja(e.ctx.admin, e.motos.id, 0);
  await abrirCaja(e.ctx.admin, e.ferreteria.id, 0);

  await vender(e.motos.id, A, 4); // 4.000, base 3.361
  const anulada = await vender(e.motos.id, A, 2);
  await anularVenta(e.ctx.admin, anulada, "Prueba de anulación");
  const conDevolucion = await vender(e.motos.id, A, 3, e.ctx.cajero); // 3.000, base 2.521; luego se devuelve 1
  const detalle = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: conDevolucion } });
  await registrarDevolucion(e.ctx.admin, conDevolucion, {
    lineas: [{ detalleVentaId: detalle.id, cantidad: "1" }],
    motivo: "Defectuosa",
    medio: "EFECTIVO",
  });
  await vender(e.ferreteria.id, B, 5); // 5.000, sin IVA
});

afterAll(() => prisma.$disconnect());

describe("utilidad", () => {
  it("responsable de IVA: base sin IVA y costo sin IVA; sin anuladas y descontando lo devuelto", async () => {
    const r = await resumenVentas(e.ctx.admin, [e.motos.id], hoy(), hoy());
    // Ingresos: 3.361 + 2.521 × 2/3 = 5.041,67 → 5.042. Costo: 6 × 250 × 100/119 = 1.260,5 → 1.261.
    expect(r).toMatchObject({
      ventas: 2,
      totalVendido: 6000,
      devoluciones: 1000,
      ventasNetas: 5042,
      ivaResponsable: 958,
      costo: 1261,
      utilidadBruta: 3781,
      anuladas: 1,
      totalAnulado: 2000,
      ticketPromedio: 3000,
    });
  });

  it("no responsable de IVA: lo cobrado y el costo completos", async () => {
    const r = await resumenVentas(e.ctx.admin, [e.ferreteria.id], hoy(), hoy());
    expect(r).toMatchObject({
      ventas: 1,
      totalVendido: 5000,
      ventasNetas: 5000,
      ivaResponsable: 0,
      costo: 3000,
      utilidadBruta: 2000,
    });
    expect(r.margen).toBe(40);
  });

  it("consolidado suma los dos negocios", async () => {
    const r = await resumenVentas(e.ctx.admin, negociosDelReporte(e.ctx.admin, "todos", null), hoy(), hoy());
    expect(r).toMatchObject({ ventas: 3, totalVendido: 11000, ventasNetas: 10042, costo: 4261, utilidadBruta: 5781 });
  });

  it("utilidad neta: resta gastos pero no el retiro del dueño ni lo anulado", async () => {
    const base = { medio: "TRANSFERENCIA" as const, fecha: hoy(), desdeCaja: false };
    await registrarMovimientoCaja(e.ctx.admin, e.motos.id, { ...base, categoria: "NOMINA", valor: 1000, pagadoA: "Andrés" });
    await registrarMovimientoCaja(e.ctx.admin, e.motos.id, { ...base, categoria: "RETIRO_DUENO", valor: 5000 });
    await registrarMovimientoCaja(e.ctx.admin, e.motos.id, { ...base, categoria: "APORTE", valor: 7000 });
    const r = await utilidadDelPeriodo(e.ctx.admin, [e.motos.id], hoy(), hoy());
    expect(r.gastos).toMatchObject({ gastos: 1000, retiros: 5000, nomina: [{ empleado: "Andrés", valor: 1000 }] });
    expect(r.utilidadNeta).toBe(3781 - 1000);
  });

  it("el total vendido coincide con las ventas registradas una por una", async () => {
    const ventas = await prisma.venta.findMany({ where: { negocioId: e.motos.id, estado: { not: "ANULADA" } } });
    const devoluciones = await prisma.devolucion.findMany({ where: { negocioId: e.motos.id } });
    const aMano = ventas.reduce((a, v) => a + v.total, 0) - devoluciones.reduce((a, d) => a + d.total, 0);
    expect((await resumenVentas(e.ctx.admin, [e.motos.id], hoy(), hoy())).totalVendido).toBe(aMano);
  });

  it("otro día no aparece", async () => {
    const r = await resumenVentas(e.ctx.admin, [e.motos.id], "2020-01-01", "2020-01-31");
    expect(r).toMatchObject({ ventas: 0, totalVendido: 0, utilidadBruta: 0, margen: null });
  });

  it("reconoce el régimen escrito a mano", () => {
    expect(esResponsableIva("Responsable de IVA")).toBe(true);
    expect(esResponsableIva("responsable del iva")).toBe(true);
    expect(esResponsableIva("No responsable de IVA")).toBe(false);
    expect(esResponsableIva("NO RESPONSABLE")).toBe(false);
    expect(esResponsableIva(null)).toBe(false);
  });
});

describe("reportes de ventas y productos", () => {
  it("por día, por cajero y por medio de pago", async () => {
    const dias = await ventasPorDia(e.ctx.admin, [e.motos.id], hoy(), hoy());
    expect(dias).toEqual([{ dia: hoy(), ventas: 2, total: 6000, utilidad: 3781 }]);

    const cajeros = await ventasPorCajero(e.ctx.admin, [e.motos.id], hoy(), hoy());
    expect(cajeros.map((c) => c.total).sort()).toEqual([2000, 4000]);

    const medios = await ventasPorMedio(e.ctx.admin, [e.motos.id], hoy(), hoy());
    expect(medios).toEqual([{ medio: "EFECTIVO", ventas: 2, total: 7000, devoluciones: 1000 }]);
  });

  it("más vendidos, menos vendidos y sin ventas", async () => {
    const C = await producto(
      e.motos.id,
      { codigo: "C", nombre: "Cadena", costo: "1000", precioVenta: "2000", porcentajeIva: 19 },
      "5",
    );
    const todos = negociosDelReporte(e.ctx.admin, "todos", null);
    const mas = await productosVendidos(e.ctx.admin, todos, hoy(), hoy(), "total");
    expect(mas.map((p) => [p.codigo, p.cantidad, p.total])).toEqual([
      ["A", "6", 6000],
      ["B", "5", 5000],
    ]);
    const porUtilidad = await productosVendidos(e.ctx.admin, todos, hoy(), hoy(), "utilidad", "menos");
    expect(porUtilidad[0].codigo).toBe("B");

    const sin = await productosSinVentas(e.ctx.admin, [e.motos.id], hoy(), hoy());
    expect(sin.total).toBe(1);
    expect(sin.productos[0]).toMatchObject({ id: C, valor: 5000 });
  });

  it("inventario valorizado a costo y a precio de venta", async () => {
    // A: 20 − 4 − 3 + 1 = 14 (la anulada devolvió su stock).
    const r = await inventarioValorizado(e.ctx.admin, [e.motos.id]);
    expect(r).toMatchObject({ productos: 1, costo: 14 * 250, venta: 14 * 1000 });
    expect(r.porCategoria[0].categoria).toBe("Sin categoría");
  });

  it("stock bajo", async () => {
    await prisma.producto.update({ where: { id: A }, data: { stockMinimo: 20 } });
    expect(await stockBajo(e.ctx.admin, [e.motos.id])).toBe(1);
  });
});

describe("exportar", () => {
  it("el Excel se abre y trae los mismos totales que la pantalla", async () => {
    const reporte = await armarReporte(e.ctx.admin, "utilidad", [e.motos.id], "Repuestos de moto", calcularPeriodo("hoy"));
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await reporteAExcel(reporte, "Camila")) as unknown as ExcelJS.Buffer);
    expect(libro.worksheets.map((h) => h.name)).toEqual(["Resumen", "Estado de resultados", "Utilidad bruta por día"]);
    const resumen = libro.getWorksheet("Resumen")!;
    const fila = resumen.getRows(1, resumen.rowCount)!.find((r) => r.getCell(1).value === "Utilidad bruta");
    expect(fila?.getCell(2).value).toBe(3781);
    const estado = libro.getWorksheet("Estado de resultados")!;
    expect(estado.getRow(estado.rowCount).values).toEqual([undefined, "Utilidad neta", 3781]);
  });

  it("todas las vistas se arman sin error", async () => {
    for (const vista of ["ventas", "utilidad", "productos", "inventario", "gastos"] as const) {
      const r = await armarReporte(e.ctx.admin, vista, [e.motos.id, e.ferreteria.id], "Todos", calcularPeriodo("mes"));
      expect(r.tablas.length).toBeGreaterThan(0);
      await reporteAExcel(r, "Camila");
    }
  });
});

describe("aislamiento de reportes", () => {
  it("el socio de la ferretería solo ve la ferretería, también en 'todos'", async () => {
    expect(negociosDelReporte(e.ctx.socio, "todos", null)).toEqual([e.ferreteria.id]);
    expect(() => negociosDelReporte(e.ctx.socio, e.motos.id, null)).toThrow(AccesoDenegado);
    await expect(resumenVentas(e.ctx.socio, [e.motos.id], hoy(), hoy())).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(productosVendidos(e.ctx.socio, [e.motos.id], hoy(), hoy())).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(inventarioValorizado(e.ctx.socio, [e.motos.id])).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(gastosDelPeriodo(e.ctx.socio, [e.motos.id], hoy(), hoy())).rejects.toBeInstanceOf(AccesoDenegado);
    const suyo = await resumenVentas(e.ctx.socio, negociosDelReporte(e.ctx.socio, "todos", null), hoy(), hoy());
    expect(suyo.totalVendido).toBe(5000);
  });

  it("el cajero no ve reportes", async () => {
    expect(() => negociosDelReporte(e.ctx.cajero, "todos", null)).toThrow(AccesoDenegado);
    await expect(resumenVentas(e.ctx.cajero, [e.motos.id], hoy(), hoy())).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("otra empresa no ve nada, ni pidiendo los negocios de Camila", async () => {
    await expect(resumenVentas(e.ctx.adminOtra, [e.motos.id], hoy(), hoy())).rejects.toBeInstanceOf(AccesoDenegado);
    const propio = await resumenVentas(e.ctx.adminOtra, negociosDelReporte(e.ctx.adminOtra, "todos", null), hoy(), hoy());
    expect(propio.ventas).toBe(0);
  });
});
