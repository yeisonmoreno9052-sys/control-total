// CLAUDE.md §9: costo promedio, movimientos de stock, pagos y aislamiento en compras.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { abrirCaja, cerrarCaja, verResumenDeCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import {
  anularAbono,
  anularFactura,
  cuentasPorPagar,
  guardarAdjunto,
  guardarProveedor,
  historialComprasProducto,
  listarFacturas,
  listarProveedores,
  obtenerFactura,
  registrarAbono,
  registrarFactura,
  type EntradaFactura,
} from "@/lib/datos/compras";
import { crearProducto } from "@/lib/datos/inventario";
import { registrarVenta } from "@/lib/datos/ventas";
import { costoPromedio, estadoDePago, totalLinea } from "@/lib/compras/costos";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { diaEnBogota } from "@/lib/formato";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

async function producto(negocioId: string, datos: Record<string, unknown> = {}, stock = "10") {
  const r = await crearProducto(
    e.ctx.admin,
    negocioId,
    esquemaProducto.parse({
      codigo: "TOR-1",
      nombre: "Tornillo 1/4",
      costo: "1000",
      precioVenta: "2000",
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

async function proveedor(negocioId: string, nombre = "Distribuidora Andina", nit: string | null = null) {
  const r = await guardarProveedor(e.ctx.admin, negocioId, null, { nombre, nit });
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

const hoy = () => diaEnBogota();

function factura(proveedorId: string, lineas: EntradaFactura["lineas"], extra: Partial<EntradaFactura> = {}): EntradaFactura {
  return {
    proveedorId,
    numero: "FV-100",
    fecha: hoy(),
    lineas,
    pago: { tipo: "credito" },
    vencimiento: hoy(),
    ...extra,
  };
}

async function registrar(negocioId: string, entrada: EntradaFactura) {
  const r = await registrarFactura(e.ctx.admin, negocioId, entrada);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

async function prod(id: string) {
  const p = await prisma.producto.findUniqueOrThrow({ where: { id } });
  return { stock: Number(p.stock), costo: p.costo, precio: p.precioVenta };
}

async function sumaMovimientos(productoId: string) {
  const movs = await prisma.movimientoInventario.findMany({ where: { productoId } });
  return movs.reduce((s, m) => s + Number(m.cantidad), 0);
}

describe("costo promedio ponderado", () => {
  it("promedia lo que había con lo que entra", () => {
    expect(costoPromedio("10", 1000, "10", 1400)).toBe(1200);
    expect(costoPromedio("3", 1000, "1", 2000)).toBe(1250);
  });

  it("con stock en cero o negativo, el costo es el de la compra", () => {
    expect(costoPromedio("0", 1000, "5", 1500)).toBe(1500);
    expect(costoPromedio("-4", 1000, "5", 1500)).toBe(1500);
  });

  it("funciona con cantidades fraccionadas y redondea al peso", () => {
    // 2,5 kg a $ 8.000 + 1,25 kg a $ 9.000 = 31.250 / 3,75 = 8.333,33
    expect(costoPromedio("2.5", 8000, "1.25", 9000)).toBe(8333);
    expect(totalLinea("2.5", 8001)).toBe(20003);
  });

  it("el estado de pago sale del total y lo pagado", () => {
    expect(estadoDePago(1000, 0)).toBe("PENDIENTE");
    expect(estadoDePago(1000, 400)).toBe("ABONO_PARCIAL");
    expect(estadoDePago(1000, 1000)).toBe("PAGADA");
  });
});

describe("registrar factura", () => {
  it("sube el stock, recalcula el costo y el stock cuadra con los movimientos", async () => {
    const p = await producto(e.motos.id);
    const prov = await proveedor(e.motos.id);
    const id = await registrar(e.motos.id, factura(prov, [{ productoId: p, cantidad: "10", costoUnitario: 1400, precioVenta: null }]));

    expect(await prod(p)).toEqual({ stock: 20, costo: 1200, precio: 2000 });
    expect(await sumaMovimientos(p)).toBe(20);
    const f = await obtenerFactura(e.ctx.admin, id);
    expect(f?.total).toBe(14000);
    expect(f?.estadoPago).toBe("PENDIENTE");
    expect(f?.detalles[0]).toMatchObject({ costoAntes: 1000, costoDespues: 1200, precioAntes: 2000, precioDespues: 2000 });
    const movs = await prisma.movimientoInventario.findMany({ where: { productoId: p, tipo: "COMPRA" } });
    expect(movs).toHaveLength(1);
  });

  it("cambia el precio de venta cuando se pide y lo deja en la auditoría", async () => {
    const p = await producto(e.motos.id);
    const prov = await proveedor(e.motos.id);
    await registrar(e.motos.id, factura(prov, [{ productoId: p, cantidad: "10", costoUnitario: 1400, precioVenta: 2400 }]));
    expect((await prod(p)).precio).toBe(2400);
    const auditoria = await prisma.auditoria.findMany({ where: { entidadId: p, accion: "CAMBIO_PRECIO" } });
    expect(auditoria).toHaveLength(1);
  });

  it("el mismo producto en dos líneas promedia en orden", async () => {
    const p = await producto(e.motos.id);
    const prov = await proveedor(e.motos.id);
    await registrar(
      e.motos.id,
      factura(prov, [
        { productoId: p, cantidad: "10", costoUnitario: 1400, precioVenta: null },
        { productoId: p, cantidad: "20", costoUnitario: 1600, precioVenta: null },
      ]),
    );
    // 10×1000 + 10×1400 = 1200; luego 20×1200 + 20×1600 = 1400
    expect(await prod(p)).toEqual({ stock: 40, costo: 1400, precio: 2000 });
    expect(await sumaMovimientos(p)).toBe(40);
  });

  it("acepta cantidades fraccionadas solo en productos fraccionados", async () => {
    const cable = await producto(e.ferreteria.id, { codigo: "CAB", nombre: "Cable", unidad: "METRO", fraccionado: true });
    const tornillo = await producto(e.ferreteria.id, { codigo: "T2" });
    const prov = await proveedor(e.ferreteria.id);
    await registrar(e.ferreteria.id, factura(prov, [{ productoId: cable, cantidad: "2.5", costoUnitario: 1000, precioVenta: null }]));
    expect((await prod(cable)).stock).toBe(12.5);
    const r = await registrarFactura(
      e.ctx.admin,
      e.ferreteria.id,
      factura(prov, [{ productoId: tornillo, cantidad: "1.5", costoUnitario: 1000, precioVenta: null }], { numero: "X2" }),
    );
    expect(r.ok).toBe(false);
  });

  it("productos de segunda exigen confirmar costo y precio", async () => {
    const p = await producto(e.motos.id, { condicion: "DE_SEGUNDA" });
    const prov = await proveedor(e.motos.id);
    const sin = await registrarFactura(
      e.ctx.admin,
      e.motos.id,
      factura(prov, [{ productoId: p, cantidad: "1", costoUnitario: 5000, precioVenta: null }]),
    );
    expect(sin.ok).toBe(false);
    if (!sin.ok) expect(sin.error).toMatch(/segunda/);
    await registrar(e.motos.id, factura(prov, [{ productoId: p, cantidad: "1", costoUnitario: 5000, precioVenta: 9000, confirmado: true }]));
    expect((await prod(p)).precio).toBe(9000);
  });

  it("no repite el número de factura del mismo proveedor, pero sí de otro", async () => {
    const p = await producto(e.motos.id);
    const a = await proveedor(e.motos.id, "AA");
    const b = await proveedor(e.motos.id, "BB");
    const linea = [{ productoId: p, cantidad: "1", costoUnitario: 1000, precioVenta: null }];
    await registrar(e.motos.id, factura(a, linea));
    const repetida = await registrarFactura(e.ctx.admin, e.motos.id, factura(a, linea, { numero: "fv-100" }));
    expect(repetida.ok).toBe(false);
    await registrar(e.motos.id, factura(b, linea));
  });

  it("valida fechas: no futura y vencimiento obligatorio a crédito", async () => {
    const p = await producto(e.motos.id);
    const prov = await proveedor(e.motos.id);
    const linea = [{ productoId: p, cantidad: "1", costoUnitario: 1000, precioVenta: null }];
    expect((await registrarFactura(e.ctx.admin, e.motos.id, factura(prov, linea, { fecha: "2999-01-01" }))).ok).toBe(false);
    expect((await registrarFactura(e.ctx.admin, e.motos.id, factura(prov, linea, { vencimiento: null }))).ok).toBe(false);
  });

  it("dos facturas al mismo tiempo del mismo producto dejan el costo bien", async () => {
    const p = await producto(e.motos.id);
    const a = await proveedor(e.motos.id, "AA");
    const b = await proveedor(e.motos.id, "BB");
    const [r1, r2] = await Promise.all([
      registrarFactura(e.ctx.admin, e.motos.id, factura(a, [{ productoId: p, cantidad: "10", costoUnitario: 1400, precioVenta: null }])),
      registrarFactura(e.ctx.admin, e.motos.id, factura(b, [{ productoId: p, cantidad: "10", costoUnitario: 1400, precioVenta: null }])),
    ]);
    expect(r1.ok && r2.ok).toBe(true);
    // 10×1000 + 10×1400 = 1200; 20×1200 + 10×1400 = 1266,67 → 1267 (en cualquier orden)
    expect(await prod(p)).toEqual({ stock: 30, costo: 1267, precio: 2000 });
    expect(await sumaMovimientos(p)).toBe(30);
  });
});

describe("pagos", () => {
  it("de contado queda pagada; los abonos cambian el estado y no pasan del saldo", async () => {
    const p = await producto(e.motos.id);
    const prov = await proveedor(e.motos.id);
    const linea = [{ productoId: p, cantidad: "10", costoUnitario: 1000, precioVenta: null }];
    const contado = await registrar(
      e.motos.id,
      factura(prov, linea, { pago: { tipo: "contado", medio: "TRANSFERENCIA", desdeCaja: false } }),
    );
    expect((await obtenerFactura(e.ctx.admin, contado))?.estadoPago).toBe("PAGADA");

    const credito = await registrar(e.motos.id, factura(prov, linea, { numero: "FV-2" }));
    const abono = await registrarAbono(e.ctx.admin, credito, { valor: 4000, medio: "TRANSFERENCIA", desdeCaja: false });
    expect(abono.ok).toBe(true);
    expect((await obtenerFactura(e.ctx.admin, credito))?.estadoPago).toBe("ABONO_PARCIAL");
    expect((await registrarAbono(e.ctx.admin, credito, { valor: 7000, medio: "TRANSFERENCIA", desdeCaja: false })).ok).toBe(false);
    await registrarAbono(e.ctx.admin, credito, { valor: 6000, medio: "TRANSFERENCIA", desdeCaja: false });
    expect((await obtenerFactura(e.ctx.admin, credito))?.estadoPago).toBe("PAGADA");

    if (abono.ok) await anularAbono(e.ctx.admin, abono.id);
    const f = await obtenerFactura(e.ctx.admin, credito);
    expect(f?.estadoPago).toBe("ABONO_PARCIAL");
    expect(f?.saldo).toBe(4000);
  });

  it("un pago en efectivo desde la caja baja lo esperado en el cierre", async () => {
    const p = await producto(e.motos.id);
    const prov = await proveedor(e.motos.id);
    const linea = [{ productoId: p, cantidad: "10", costoUnitario: 1000, precioVenta: null }];
    const contadoSinCaja = await registrarFactura(
      e.ctx.admin,
      e.motos.id,
      factura(prov, linea, { pago: { tipo: "contado", medio: "EFECTIVO", desdeCaja: true } }),
    );
    expect(contadoSinCaja.ok).toBe(false);

    const caja = await abrirCaja(e.ctx.admin, e.motos.id, 100000);
    if (!caja.ok) throw new Error(caja.error);
    await registrar(e.motos.id, factura(prov, linea, { pago: { tipo: "contado", medio: "EFECTIVO", desdeCaja: true } }));
    const credito = await registrar(e.motos.id, factura(prov, linea, { numero: "FV-2" }));
    const abono = await registrarAbono(e.ctx.admin, credito, { valor: 3000, medio: "EFECTIVO", desdeCaja: true });
    // Efectivo que no salió de la caja no cuenta.
    await registrarAbono(e.ctx.admin, credito, { valor: 2000, medio: "EFECTIVO", desdeCaja: false });

    let resumen = await verResumenDeCaja(e.ctx.admin, caja.id);
    expect(resumen?.pagosProveedores).toBe(13000);
    expect(resumen?.esperado).toBe(87000);

    if (abono.ok) await anularAbono(e.ctx.admin, abono.id);
    resumen = await verResumenDeCaja(e.ctx.admin, caja.id);
    expect(resumen?.esperado).toBe(90000);

    // Con la caja cerrada, ya no se puede anular un pago que salió de ella.
    const otro = await registrarAbono(e.ctx.admin, credito, { valor: 1000, medio: "EFECTIVO", desdeCaja: true });
    await cerrarCaja(e.ctx.admin, caja.id, 89000, null);
    if (otro.ok) expect((await anularAbono(e.ctx.admin, otro.id)).ok).toBe(false);
  });

  it("cuentas por pagar: saldo total, vencido y por proveedor", async () => {
    const p = await producto(e.motos.id);
    const a = await proveedor(e.motos.id, "AA");
    const b = await proveedor(e.motos.id, "BB");
    const linea = [{ productoId: p, cantidad: "10", costoUnitario: 1000, precioVenta: null }];
    await registrar(e.motos.id, factura(a, linea, { fecha: "2026-01-01", vencimiento: "2026-01-31" }));
    await registrar(e.motos.id, factura(b, linea, { numero: "B1" }));
    await registrar(e.motos.id, factura(b, linea, { numero: "B2", pago: { tipo: "contado", medio: "TRANSFERENCIA", desdeCaja: false } }));

    const cxp = await cuentasPorPagar(e.ctx.admin, e.motos.id);
    expect(cxp.total).toBe(20000);
    expect(cxp.vencido).toBe(10000);
    expect(cxp.facturas[0].vencida).toBe(true);
    expect(cxp.porProveedor.map((x) => [x.proveedor, x.saldo])).toEqual([
      ["AA", 10000],
      ["BB", 10000],
    ]);
    const lista = await listarProveedores(e.ctx.admin, e.motos.id);
    expect(lista.find((x) => x.nombre === "AA")?.deuda).toBe(10000);
  });
});

describe("anular factura", () => {
  it("el stock vuelve a bajar y el costo no se recalcula hacia atrás", async () => {
    const p = await producto(e.motos.id);
    const prov = await proveedor(e.motos.id);
    const id = await registrar(e.motos.id, factura(prov, [{ productoId: p, cantidad: "10", costoUnitario: 1400, precioVenta: null }]));
    const r = await anularFactura(e.ctx.admin, id, "Factura mal escrita");
    expect(r.ok).toBe(true);
    expect(await prod(p)).toEqual({ stock: 10, costo: 1200, precio: 2000 });
    expect(await sumaMovimientos(p)).toBe(10);
    expect((await obtenerFactura(e.ctx.admin, id))?.estado).toBe("ANULADA");
    expect((await anularFactura(e.ctx.admin, id, "otra vez")).ok).toBe(false);
    // Anulada, el número se puede volver a usar.
    await registrar(e.motos.id, factura(prov, [{ productoId: p, cantidad: "1", costoUnitario: 1000, precioVenta: null }]));
    expect(await historialComprasProducto(e.ctx.admin, p)).toHaveLength(2);
  });

  it("no deja anular si ya se vendió y no alcanza el stock", async () => {
    const p = await producto(e.motos.id, {}, "0");
    const prov = await proveedor(e.motos.id);
    const id = await registrar(e.motos.id, factura(prov, [{ productoId: p, cantidad: "5", costoUnitario: 1000, precioVenta: null }]));
    const caja = await abrirCaja(e.ctx.admin, e.motos.id, 0);
    if (!caja.ok) throw new Error(caja.error);
    const v = await registrarVenta(e.ctx.admin, e.motos.id, {
      lineas: [{ productoId: p, cantidad: "3" }],
      totalEsperado: 6000,
      pago: { forma: "efectivo", recibido: 6000 },
    });
    expect(v.ok).toBe(true);
    const r = await anularFactura(e.ctx.admin, id, "Devuelta al proveedor");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya se vendió/);
    expect((await prod(p)).stock).toBe(2);
  });

  it("no deja anular si tiene pagos vigentes", async () => {
    const p = await producto(e.motos.id);
    const prov = await proveedor(e.motos.id);
    const id = await registrar(
      e.motos.id,
      factura(prov, [{ productoId: p, cantidad: "1", costoUnitario: 1000, precioVenta: null }], {
        pago: { tipo: "contado", medio: "TRANSFERENCIA", desdeCaja: false },
      }),
    );
    const r = await anularFactura(e.ctx.admin, id, "Error");
    expect(r.ok).toBe(false);
    const f = await obtenerFactura(e.ctx.admin, id);
    await anularAbono(e.ctx.admin, f!.abonos[0].id);
    expect((await anularFactura(e.ctx.admin, id, "Error")).ok).toBe(true);
  });
});

describe("adjuntos", () => {
  it("acepta fotos y PDF, rechaza otros archivos y máximo 3", async () => {
    const p = await producto(e.motos.id);
    const prov = await proveedor(e.motos.id);
    const id = await registrar(e.motos.id, factura(prov, [{ productoId: p, cantidad: "1", costoUnitario: 1000, precioVenta: null }]));
    const pdf = new TextEncoder().encode("%PDF-1.4 prueba");
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect((await guardarAdjunto(e.ctx.admin, id, "a.pdf", pdf)).ok).toBe(true);
    expect((await guardarAdjunto(e.ctx.admin, id, "b.jpg", jpg)).ok).toBe(true);
    expect((await guardarAdjunto(e.ctx.admin, id, "c.exe", new TextEncoder().encode("MZ..."))).ok).toBe(false);
    expect((await guardarAdjunto(e.ctx.admin, id, "c.pdf", pdf)).ok).toBe(true);
    expect((await guardarAdjunto(e.ctx.admin, id, "d.pdf", pdf)).ok).toBe(false);
    expect((await obtenerFactura(e.ctx.admin, id))?.adjuntos).toHaveLength(3);
  });
});

describe("aislamiento", () => {
  it("el socio de la ferretería no ve proveedores ni facturas de motos", async () => {
    const p = await producto(e.motos.id);
    const prov = await proveedor(e.motos.id);
    const id = await registrar(e.motos.id, factura(prov, [{ productoId: p, cantidad: "1", costoUnitario: 1000, precioVenta: null }]));
    await expect(listarProveedores(e.ctx.socio, e.motos.id)).rejects.toThrow(AccesoDenegado);
    await expect(listarFacturas(e.ctx.socio, e.motos.id)).rejects.toThrow(AccesoDenegado);
    expect(await obtenerFactura(e.ctx.socio, id)).toBeNull();
    expect((await registrarAbono(e.ctx.socio, id, { valor: 1, medio: "TRANSFERENCIA", desdeCaja: false })).ok).toBe(false);
    expect((await anularFactura(e.ctx.socio, id, "No es mía")).ok).toBe(false);
    expect(await historialComprasProducto(e.ctx.socio, p)).toEqual([]);
    // Tampoco puede meter un producto de motos en una factura de la ferretería.
    const provF = await guardarProveedor(e.ctx.socio, e.ferreteria.id, null, { nombre: "Ferretero" });
    if (!provF.ok) throw new Error(provF.error);
    const cruzada = await registrarFactura(
      e.ctx.socio,
      e.ferreteria.id,
      factura(provF.id, [{ productoId: p, cantidad: "1", costoUnitario: 1, precioVenta: null }]),
    );
    expect(cruzada.ok).toBe(false);
    expect((await prod(p)).stock).toBe(11);
  });

  it("otra empresa no ve nada", async () => {
    const p = await producto(e.motos.id);
    const prov = await proveedor(e.motos.id);
    const id = await registrar(e.motos.id, factura(prov, [{ productoId: p, cantidad: "1", costoUnitario: 1000, precioVenta: null }]));
    expect(await obtenerFactura(e.ctx.adminOtra, id)).toBeNull();
    await expect(cuentasPorPagar(e.ctx.adminOtra, e.motos.id)).rejects.toThrow(AccesoDenegado);
    expect((await registrarAbono(e.ctx.adminOtra, id, { valor: 1, medio: "TRANSFERENCIA", desdeCaja: false })).ok).toBe(false);
    expect((await guardarAdjunto(e.ctx.adminOtra, id, "x.pdf", new TextEncoder().encode("%PDF"))).ok).toBe(false);
    // El proveedor de otra empresa no sirve en una factura propia.
    const otro = await guardarProveedor(e.ctx.adminOtra, e.tiendaOtra.id, null, { nombre: "Ajeno" });
    if (!otro.ok) throw new Error(otro.error);
    const r = await registrarFactura(
      e.ctx.admin,
      e.motos.id,
      factura(otro.id, [{ productoId: p, cantidad: "1", costoUnitario: 1, precioVenta: null }]),
    );
    expect(r.ok).toBe(false);
  });

  it("el cajero no entra al módulo", async () => {
    const prov = await proveedor(e.motos.id);
    await expect(listarProveedores(e.ctx.cajero, e.motos.id)).rejects.toThrow(AccesoDenegado);
    await expect(cuentasPorPagar(e.ctx.cajero, e.motos.id)).rejects.toThrow(AccesoDenegado);
    await expect(guardarProveedor(e.ctx.cajero, e.motos.id, prov, { nombre: "Hack" })).rejects.toThrow(AccesoDenegado);
    await expect(
      registrarFactura(e.ctx.cajero, e.motos.id, factura(prov, [])),
    ).rejects.toThrow(AccesoDenegado);
  });
});
