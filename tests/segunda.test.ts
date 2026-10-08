// Piezas de segunda: "Compré una pieza de segunda", códigos SEG-, compra a Particulares,
// etiqueta y utilidad separada entre nuevo y de segunda.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { abrirCaja, resumenDeCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import { PROVEEDOR_PARTICULARES, registrarPiezaSegunda } from "@/lib/datos/compras";
import { crearProducto } from "@/lib/datos/inventario";
import { utilidadPorCondicion } from "@/lib/datos/reportes";
import { registrarVenta } from "@/lib/datos/ventas";
import { codigoBarrasSvg, textoParaBarras } from "@/lib/etiquetas/codigo-barras";
import { diaEnBogota } from "@/lib/formato";
import { esquemaPiezaSegunda, esquemaProducto } from "@/lib/inventario/esquemas";
import { armarReporte } from "@/lib/reportes/armar";
import { calcularPeriodo } from "@/lib/reportes/periodos";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterAll(() => prisma.$disconnect());

const pieza = (datos: Record<string, unknown> = {}) =>
  esquemaPiezaSegunda.parse({
    nombre: "Carburador Boxer usado",
    cantidad: "1",
    costo: "40.000",
    precioVenta: "90.000",
    porcentajeIva: "0",
    medio: "TRANSFERENCIA",
    desdeCaja: false,
    ...datos,
  });

async function registrar(datos: Record<string, unknown> = {}, negocioId = e.motos.id, ctx = e.ctx.admin) {
  const r = await registrarPiezaSegunda(ctx, negocioId, pieza(datos));
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("Compré una pieza de segunda", () => {
  it("crea el producto con código SEG-, su costo exacto, el stock y la compra a Particulares", async () => {
    const r = await registrar({ cantidad: "2" });
    expect(r.codigo).toBe("SEG-0001");
    const p = await prisma.producto.findUniqueOrThrow({ where: { id: r.id } });
    expect(p).toMatchObject({ condicion: "DE_SEGUNDA", costo: 40000, precioVenta: 90000, unidad: "UNIDAD", negocioId: e.motos.id });
    expect(p.stock.toString()).toBe("2");

    const movimientos = await prisma.movimientoInventario.findMany({ where: { productoId: r.id } });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({ tipo: "COMPRA" });

    const factura = await prisma.facturaCompra.findFirstOrThrow({ where: { negocioId: e.motos.id } });
    expect(factura).toMatchObject({ numero: "SEG-0001", total: 80000, pagado: 80000, estadoPago: "PAGADA" });
    const proveedor = await prisma.proveedor.findUniqueOrThrow({ where: { id: factura.proveedorId } });
    expect(proveedor.nombre).toBe(PROVEEDOR_PARTICULARES);
  });

  it("numera seguido por negocio y reutiliza el mismo proveedor Particulares", async () => {
    await registrar();
    const segunda = await registrar({ nombre: "Tanque usado" });
    expect(segunda.codigo).toBe("SEG-0002");
    const otra = await registrar({}, e.ferreteria.id);
    expect(otra.codigo).toBe("SEG-0001");
    expect(await prisma.proveedor.count({ where: { negocioId: e.motos.id, nombre: PROVEEDOR_PARTICULARES } })).toBe(1);
  });

  it("dos registros al mismo tiempo no repiten código", async () => {
    const r = await Promise.all([registrar(), registrar(), registrar()]);
    expect(new Set(r.map((x) => x.codigo)).size).toBe(3);
  });

  it("puede comprarse a un proveedor del negocio, pero no a uno de otro negocio", async () => {
    const prov = await prisma.proveedor.create({
      data: { empresaId: e.camila.id, negocioId: e.ferreteria.id, nombre: "Proveedor ferretería" },
    });
    const malo = await registrarPiezaSegunda(e.ctx.admin, e.motos.id, pieza({ proveedorId: prov.id }));
    expect(malo.ok).toBe(false);
    const bueno = await registrarPiezaSegunda(e.ctx.admin, e.ferreteria.id, pieza({ proveedorId: prov.id }));
    expect(bueno.ok).toBe(true);
  });

  it("pagado en efectivo desde la caja, se descuenta del cierre", async () => {
    const sinCaja = await registrarPiezaSegunda(e.ctx.admin, e.motos.id, pieza({ medio: "EFECTIVO", desdeCaja: true }));
    expect(sinCaja).toMatchObject({ ok: false });
    expect(await prisma.producto.count()).toBe(0); // no deja la pieza a medias

    await abrirCaja(e.ctx.admin, e.motos.id, 100000);
    await registrar({ medio: "EFECTIVO", desdeCaja: true });
    const caja = await prisma.caja.findFirstOrThrow({ where: { negocioId: e.motos.id } });
    const resumen = await resumenDeCaja(prisma, e.ctx.admin, caja.id);
    expect(resumen?.esperado).toBe(60000);
  });

  it("el cajero y el socio de la ferretería no pueden registrar piezas en motos", async () => {
    for (const ctx of [e.ctx.cajero, e.ctx.socio]) {
      await expect(registrarPiezaSegunda(ctx, e.motos.id, pieza())).rejects.toBeInstanceOf(AccesoDenegado);
    }
  });

  it("valida lo que escribe la persona", () => {
    const r = esquemaPiezaSegunda.safeParse({ nombre: "", cantidad: "1,5", costo: "x", precioVenta: "0", porcentajeIva: "7", medio: "" });
    expect(r.success).toBe(false);
    const campos = new Set(r.error!.issues.map((i) => i.path[0]));
    for (const c of ["nombre", "cantidad", "costo", "porcentajeIva", "medio"]) expect(campos).toContain(c);
  });
});

describe("etiqueta", () => {
  it("usa el código de barras del producto si tiene, si no el código", () => {
    expect(textoParaBarras({ codigo: "SEG-0001", codigoBarras: null })).toBe("SEG-0001");
    expect(textoParaBarras({ codigo: "A1", codigoBarras: "7701234567890" })).toBe("7701234567890");
    expect(codigoBarrasSvg("SEG-0001")).toMatch(/^<svg/);
    expect(codigoBarrasSvg("TUERCA-Ñ")).toBeNull();
  });
});

describe("utilidad nuevo y de segunda", () => {
  it("separa la utilidad bruta y aparece en el reporte de utilidad", async () => {
    const nuevo = await crearProducto(
      e.ctx.admin,
      e.motos.id,
      esquemaProducto.parse({
        codigo: "B1",
        nombre: "Bujía",
        costo: "600",
        precioVenta: "1000",
        porcentajeIva: 0,
        stockMinimo: "0",
        unidad: "UNIDAD",
        fraccionado: false,
        condicion: "NUEVO",
      }),
      "10",
    );
    if (!nuevo.ok) throw new Error(nuevo.error);
    const seg = await registrar();
    await abrirCaja(e.ctx.admin, e.motos.id, 0);
    const r = await registrarVenta(e.ctx.admin, e.motos.id, {
      lineas: [
        { productoId: nuevo.id, cantidad: "2" },
        { productoId: seg.id, cantidad: "1" },
      ],
      totalEsperado: 92000,
      pago: { forma: "efectivo", recibido: 92000 },
    });
    if (!r.ok) throw new Error(r.error);

    const hoy = diaEnBogota();
    const u = await utilidadPorCondicion(e.ctx.admin, [e.motos.id], hoy, hoy);
    expect(u.nuevo).toMatchObject({ ventasNetas: 2000, costo: 1200, utilidad: 800 });
    expect(u.segunda).toMatchObject({ ventasNetas: 90000, costo: 40000, utilidad: 50000 });

    const reporte = await armarReporte(e.ctx.admin, "utilidad", [e.motos.id], "Motos", calcularPeriodo("hoy"));
    const tabla = reporte.tablas.find((t) => t.titulo === "Nuevo y de segunda");
    expect(tabla?.filas[1]).toEqual(["De segunda", 90000, 40000, 50000, 55.6]);
  });

  it("sin ventas de segunda no aparece la tabla", async () => {
    const reporte = await armarReporte(e.ctx.admin, "utilidad", [e.motos.id], "Motos", calcularPeriodo("hoy"));
    expect(reporte.tablas.some((t) => t.titulo === "Nuevo y de segunda")).toBe(false);
  });

  it("el cajero no ve la utilidad por condición", async () => {
    const hoy = diaEnBogota();
    await expect(utilidadPorCondicion(e.ctx.cajero, [e.motos.id], hoy, hoy)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
