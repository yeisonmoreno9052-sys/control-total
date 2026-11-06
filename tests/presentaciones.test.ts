// Paquetes con precio propio: el tubo se lleva en metros ($4.500 el metro) y el
// "Tubo completo" de 6 m se vende en $20.000. El stock siempre queda en metros.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { abrirCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import { actualizarProducto, crearProducto } from "@/lib/datos/inventario";
import { obtenerProducto, productosParaVenta } from "@/lib/datos/productos";
import { anularVenta, registrarDevolucion, registrarVenta, type EntradaVenta } from "@/lib/datos/ventas";
import { subirVentaSinConexion } from "@/lib/datos/ventas-sin-conexion";
import { esquemaProducto, type ProductoEntrada } from "@/lib/inventario/esquemas";
import { leerPresentaciones } from "@/lib/inventario/presentaciones";
import { textoCantidad } from "@/lib/ventas/recibo";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

const tubo = {
  codigo: "TUBO-12",
  nombre: "Tubo PVC 1/2",
  costo: "2500",
  precioVenta: "4500",
  stockMinimo: "0",
  unidad: "METRO",
  fraccionado: true,
  porcentajeIva: 0,
  condicion: "NUEVO",
  presentaciones: [{ nombre: "Tubo completo", cantidad: "6", precio: "20.000" }],
};

async function crearTubo(stock = "60", datos: Record<string, unknown> = {}) {
  const entrada = esquemaProducto.parse({ ...tubo, ...datos });
  const r = await crearProducto(e.ctx.admin, e.ferreteria.id, entrada, stock);
  if (!r.ok) throw new Error(r.error);
  const p = await obtenerProducto(e.ctx.admin, r.id);
  return { id: r.id, entrada, completo: p!.presentaciones[0] };
}

function venta(lineas: EntradaVenta["lineas"], total: number): EntradaVenta {
  return { lineas, totalEsperado: total, pago: { forma: "efectivo", recibido: total } };
}

async function stockDe(id: string) {
  return Number((await prisma.producto.findUniqueOrThrow({ where: { id } })).stock);
}

describe("paquetes en el producto", () => {
  it("se guardan con un id fijo y la caja los recibe", async () => {
    const { id, completo } = await crearTubo();
    expect(completo).toMatchObject({ nombre: "Tubo completo", cantidad: "6", precio: 20000 });
    expect(completo.id).toMatch(/^\w{4,}$/);
    const [enCaja] = await productosParaVenta(e.ctx.socio, e.ferreteria.id, [id]);
    expect(enCaja.presentaciones).toEqual([completo]);
  });

  it("revisa nombre, cantidad y precio", () => {
    const error = (presentaciones: unknown[], datos: Record<string, unknown> = {}) => {
      const r = esquemaProducto.safeParse({ ...tubo, ...datos, presentaciones });
      return r.success ? null : r.error.issues[0].message;
    };
    expect(error([{ nombre: "Tubo", cantidad: "6", precio: "20000" }, { nombre: "tubo", cantidad: "3", precio: "10000" }])).toMatch(
      /dos paquetes/,
    );
    expect(error([{ nombre: "Tubo", cantidad: "0", precio: "20000" }])).toMatch(/cuánto trae/);
    expect(error([{ nombre: "Tubo", cantidad: "6", precio: "" }])).toMatch(/precio del paquete/);
    expect(error([{ nombre: "", cantidad: "6", precio: "20000" }])).toMatch(/nombre del paquete/);
    // La caja de tornillos va por unidades enteras.
    expect(
      error([{ nombre: "Caja", cantidad: "100,5", precio: "9000" }], { unidad: "UNIDAD", fraccionado: false }),
    ).toMatch(/unidades completas/);
    expect(error([{ nombre: "Caja", cantidad: "100", precio: "9000" }], { unidad: "UNIDAD", fraccionado: false })).toBeNull();
  });

  it("cambiar los paquetes conserva el id y queda en el historial", async () => {
    const { id, entrada, completo } = await crearTubo();
    const nuevo: ProductoEntrada = {
      ...entrada,
      presentaciones: [{ ...completo, precio: 21000 }],
    };
    expect((await actualizarProducto(e.ctx.admin, id, nuevo)).ok).toBe(true);
    const p = await obtenerProducto(e.ctx.admin, id);
    expect(p!.presentaciones).toEqual([{ ...completo, precio: 21000 }]);
    const auditoria = await prisma.auditoria.findFirstOrThrow({ where: { entidadId: id, accion: "CAMBIO_PRECIO" } });
    expect(JSON.stringify(auditoria.detalle)).toContain("$ 21.000");

    // Sin la lista (importación desde Excel), los paquetes no se tocan.
    expect((await actualizarProducto(e.ctx.admin, id, { ...entrada, presentaciones: undefined })).ok).toBe(true);
    expect((await obtenerProducto(e.ctx.admin, id))!.presentaciones).toHaveLength(1);
  });
});

describe("vender por paquete", () => {
  it("cobra el precio del paquete y descuenta lo que trae", async () => {
    const { id, completo } = await crearTubo();
    await abrirCaja(e.ctx.admin, e.ferreteria.id, 0);
    // 2 tubos completos ($40.000) y 3 metros sueltos ($13.500).
    const r = await registrarVenta(
      e.ctx.admin,
      e.ferreteria.id,
      venta(
        [
          { productoId: id, presentacionId: completo.id, cantidad: "2" },
          { productoId: id, cantidad: "3" },
        ],
        53500,
      ),
    );
    expect(r).toMatchObject({ ok: true, total: 53500 });
    expect(await stockDe(id)).toBe(45);

    const detalles = await prisma.detalleVenta.findMany({ where: { productoId: id }, orderBy: { total: "desc" } });
    expect(detalles[0]).toMatchObject({ presentacion: "Tubo completo", precioUnitario: 20000, subtotal: 40000, costoUnitario: 2500 });
    expect(Number(detalles[0].cantidad)).toBe(12);
    expect(Number(detalles[0].paquetes)).toBe(2);
    expect(Number(detalles[0].porPresentacion)).toBe(6);
    expect(detalles[1]).toMatchObject({ presentacion: null, precioUnitario: 4500, subtotal: 13500 });

    const linea = {
      cantidad: detalles[0].cantidad.toString(),
      unidad: "METRO",
      presentacion: detalles[0].presentacion,
      porPresentacion: detalles[0].porPresentacion!.toString(),
      paquetes: detalles[0].paquetes!.toString(),
    };
    expect(textoCantidad(linea)).toBe("2 Tubo completo (6 m)");
    expect(textoCantidad({ cantidad: "3", unidad: "METRO" })).toBe("3 m");

    // Anular devuelve los 15 m.
    if (!r.ok) return;
    expect((await anularVenta(e.ctx.admin, r.id, "Prueba")).ok).toBe(true);
    expect(await stockDe(id)).toBe(60);
  });

  it("el stock alcanza para todo junto: tubos completos más metros sueltos", async () => {
    const { id, completo } = await crearTubo("10");
    await abrirCaja(e.ctx.socio, e.ferreteria.id, 0);
    const r = await registrarVenta(
      e.ctx.socio,
      e.ferreteria.id,
      venta(
        [
          { productoId: id, presentacionId: completo.id, cantidad: "1" },
          { productoId: id, cantidad: "5" },
        ],
        42500,
      ),
    );
    expect(r).toMatchObject({ ok: false, error: 'No hay suficiente stock de "Tubo PVC 1/2": solo quedan 10.' });
    expect(await stockDe(id)).toBe(10);
  });

  it("los paquetes se venden completos y deben existir", async () => {
    const { id, completo } = await crearTubo();
    await abrirCaja(e.ctx.socio, e.ferreteria.id, 0);
    const medio = await registrarVenta(
      e.ctx.socio,
      e.ferreteria.id,
      venta([{ productoId: id, presentacionId: completo.id, cantidad: "1,5" }], 30000),
    );
    expect(medio.ok).toBe(false);

    const otro = await registrarVenta(
      e.ctx.socio,
      e.ferreteria.id,
      venta([{ productoId: id, presentacionId: "no-existe", cantidad: "1" }], 20000),
    );
    expect(otro).toMatchObject({ ok: false, error: expect.stringContaining("ya no existe") });
  });

  it("una devolución parcial del tubo completo devuelve en metros y en proporción", async () => {
    const { id, completo } = await crearTubo();
    await abrirCaja(e.ctx.admin, e.ferreteria.id, 0);
    const r = await registrarVenta(
      e.ctx.admin,
      e.ferreteria.id,
      venta([{ productoId: id, presentacionId: completo.id, cantidad: "1" }], 20000),
    );
    if (!r.ok) throw new Error(r.error);
    const detalle = await prisma.detalleVenta.findFirstOrThrow({ where: { ventaId: r.id } });
    const d = await registrarDevolucion(e.ctx.admin, r.id, {
      lineas: [{ detalleVentaId: detalle.id, cantidad: "3" }],
      motivo: "Sobró medio tubo",
      medio: "EFECTIVO",
    });
    expect(d).toMatchObject({ ok: true, total: 10000 });
    expect(await stockDe(id)).toBe(57);
  });

  it("sin internet: se respeta el paquete como se cobró", async () => {
    const { id, completo } = await crearTubo();
    await abrirCaja(e.ctx.socio, e.ferreteria.id, 0);
    const r = await subirVentaSinConexion(e.ctx.socio, e.ferreteria.id, {
      idLocal: `local-paquete-${Date.now()}`,
      numeroProvisional: "P-0001",
      creadaEn: new Date().toISOString(),
      lineas: [
        {
          productoId: id,
          presentacion: { id: completo.id, nombre: completo.nombre, cantidad: completo.cantidad },
          cantidad: "1",
          precioUnitario: 20000,
          porcentajeIva: 0,
        },
      ],
      pago: { forma: "efectivo", recibido: 20000 },
      total: 20000,
    });
    expect(r).toMatchObject({ ok: true, nota: null });
    expect(await stockDe(id)).toBe(54);
    const detalle = await prisma.detalleVenta.findFirstOrThrow({ where: { productoId: id } });
    expect(detalle).toMatchObject({ presentacion: "Tubo completo", precioUnitario: 20000 });
  });

  it("lee lo guardado aunque venga dañado", () => {
    expect(leerPresentaciones(null)).toEqual([]);
    expect(leerPresentaciones([{ id: "a", nombre: "Caja", cantidad: "10", precio: 5000 }, { nombre: "x" }, "y"])).toEqual([
      { id: "a", nombre: "Caja", cantidad: "10", precio: 5000 },
    ]);
  });
});
