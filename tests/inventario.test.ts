// Movimientos de stock, permisos de inventario e importación.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado, datosDe } from "@/lib/datos/alcance";
import { prisma } from "@/lib/datos/cliente";
import { ajustarStock, actualizarProducto, crearProducto } from "@/lib/datos/inventario";
import { analizarImportacion, ejecutarImportacion } from "@/lib/datos/importacion";
import { buscarProductos, contarStockBajo, obtenerProducto } from "@/lib/datos/productos";
import { esquemaProducto, type ProductoEntrada } from "@/lib/inventario/esquemas";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

function producto(datos: Partial<Record<keyof ProductoEntrada, unknown>> = {}): ProductoEntrada {
  return esquemaProducto.parse({
    codigo: "TOR-1",
    nombre: "Tornillo 1/4",
    costo: "250",
    precioVenta: "400",
    stockMinimo: "10",
    unidad: "UNIDAD",
    fraccionado: false,
    porcentajeIva: 19,
    condicion: "NUEVO",
    ...datos,
  });
}

async function crear(ctx = e.ctx.admin, negocioId = e.ferreteria.id, datos = {}, stock = "50") {
  const r = await crearProducto(ctx, negocioId, producto(datos), stock);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

async function sumaMovimientos(productoId: string) {
  const movs = await prisma.movimientoInventario.findMany({ where: { productoId } });
  return movs.reduce((s, m) => s + Number(m.cantidad), 0);
}

async function stockDe(id: string) {
  return Number((await prisma.producto.findUniqueOrThrow({ where: { id } })).stock);
}

describe("movimientos de stock", () => {
  it("el stock inicial queda como movimiento", async () => {
    const id = await crear();
    expect(await stockDe(id)).toBe(50);
    expect(await sumaMovimientos(id)).toBe(50);
  });

  it("los ajustes dejan movimiento, auditoría, y el stock se explica por sus movimientos", async () => {
    const id = await crear();
    expect((await ajustarStock(e.ctx.admin, id, { modo: "diferencia", cantidad: "-5", motivo: "DANO" })).ok).toBe(true);
    expect((await ajustarStock(e.ctx.socio, id, { modo: "nuevo", cantidad: "30", motivo: "CONTEO" })).ok).toBe(true);
    expect(await stockDe(id)).toBe(30);
    expect(await sumaMovimientos(id)).toBe(30);
    const auditorias = await prisma.auditoria.findMany({ where: { entidadId: id, accion: "AJUSTE_STOCK" } });
    expect(auditorias).toHaveLength(2);
  });

  it("no deja el stock negativo ni acepta decimales en productos por unidad", async () => {
    const id = await crear();
    const negativo = await ajustarStock(e.ctx.admin, id, { modo: "diferencia", cantidad: "-51", motivo: "PERDIDA" });
    expect(negativo).toMatchObject({ ok: false, error: "El stock no puede quedar negativo." });
    const decimal = await ajustarStock(e.ctx.admin, id, { modo: "nuevo", cantidad: "2,5", motivo: "CONTEO" });
    expect(decimal.ok).toBe(false);
    expect(await stockDe(id)).toBe(50);
  });

  it("los productos fraccionados aceptan decimales (2,5 metros)", async () => {
    const id = await crear(e.ctx.admin, e.ferreteria.id, { codigo: "CAB-12", unidad: "METRO", fraccionado: true }, "100");
    await ajustarStock(e.ctx.admin, id, { modo: "diferencia", cantidad: "-2,5", motivo: "OTRO", nota: "Muestra" });
    expect(await stockDe(id)).toBe(97.5);
  });

  it("el motivo 'otro' exige una nota", async () => {
    const id = await crear();
    const r = await ajustarStock(e.ctx.admin, id, { modo: "diferencia", cantidad: "1", motivo: "OTRO" });
    expect(r.ok).toBe(false);
  });

  it("dos ajustes al mismo tiempo no se pisan", async () => {
    const id = await crear(e.ctx.admin, e.ferreteria.id, {}, "10");
    await Promise.all(
      Array.from({ length: 10 }, () =>
        ajustarStock(e.ctx.admin, id, { modo: "diferencia", cantidad: "-1", motivo: "DANO" }),
      ),
    );
    expect(await stockDe(id)).toBe(0);
    expect(await sumaMovimientos(id)).toBe(0);
  });

  it("los movimientos no se pueden editar ni borrar, y los productos no se borran", async () => {
    const id = await crear();
    const datos = datosDe(e.ctx.admin);
    await expect(datos.movimientoInventario.updateMany({ data: { cantidad: "999" } })).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(datos.movimientoInventario.deleteMany({})).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(datos.producto.delete({ where: { id } })).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("un cambio de precio queda en auditoría", async () => {
    const id = await crear();
    await actualizarProducto(e.ctx.admin, id, producto({ precioVenta: "450" }));
    const a = await prisma.auditoria.findFirstOrThrow({ where: { entidadId: id, accion: "CAMBIO_PRECIO" } });
    expect(a.detalle).toMatchObject({ precioVenta: { antes: 400, despues: 450 } });
  });

  it("no permite códigos repetidos en el mismo negocio, sí en negocios distintos", async () => {
    await crear();
    const repetido = await crearProducto(e.ctx.admin, e.ferreteria.id, producto(), "0");
    expect(repetido).toMatchObject({ ok: false, error: "Ya hay otro producto con ese código." });
    const otroNegocio = await crearProducto(e.ctx.admin, e.motos.id, producto(), "0");
    expect(otroNegocio.ok).toBe(true);
  });
});

describe("permisos de inventario", () => {
  it("el cajero ve productos pero nunca el costo", async () => {
    await crear(e.ctx.admin, e.motos.id);
    const { productos } = await buscarProductos(e.ctx.cajero, e.motos.id, {});
    expect(productos).toHaveLength(1);
    expect(productos[0]).not.toHaveProperty("costo", 250);
    expect(productos[0].costo).toBeUndefined();
    const uno = await obtenerProducto(e.ctx.cajero, productos[0].id);
    expect(uno?.costo).toBeUndefined();

    const comoAdmin = await obtenerProducto(e.ctx.admin, productos[0].id);
    expect(comoAdmin?.costo).toBe(250);
  });

  it("el cajero no puede crear, editar ni ajustar aunque llame directo a la función", async () => {
    const id = await crear(e.ctx.admin, e.motos.id);
    await expect(crearProducto(e.ctx.cajero, e.motos.id, producto({ codigo: "X" }), "0")).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(actualizarProducto(e.ctx.cajero, id, producto())).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(
      ajustarStock(e.ctx.cajero, id, { modo: "nuevo", cantidad: "0", motivo: "CONTEO" }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("el socio de la ferretería no ve ni toca productos de motos", async () => {
    const id = await crear(e.ctx.admin, e.motos.id);
    expect(await obtenerProducto(e.ctx.socio, id)).toBeNull();
    expect((await buscarProductos(e.ctx.socio, e.motos.id, {})).total).toBe(0);
    expect((await actualizarProducto(e.ctx.socio, id, producto({ precioVenta: "1" }))).ok).toBe(false);
    expect((await ajustarStock(e.ctx.socio, id, { modo: "nuevo", cantidad: "0", motivo: "CONTEO" })).ok).toBe(false);
    await expect(crearProducto(e.ctx.socio, e.motos.id, producto({ codigo: "Y" }), "0")).rejects.toBeInstanceOf(AccesoDenegado);
    expect(await stockDe(id)).toBe(50);
  });

  it("otra empresa no ve los productos de Camila", async () => {
    const id = await crear();
    expect(await obtenerProducto(e.ctx.adminOtra, id)).toBeNull();
    expect((await buscarProductos(e.ctx.adminOtra, e.ferreteria.id, {})).total).toBe(0);
  });
});

describe("búsqueda y stock bajo", () => {
  it("busca por partes del nombre, por código y por código de barras", async () => {
    await crear(e.ctx.admin, e.ferreteria.id, { codigo: "TOR-14", nombre: "Tornillo drywall 1/4 x 2", codigoBarras: "7701" });
    await crear(e.ctx.admin, e.ferreteria.id, { codigo: "PUN-1", nombre: "Puntilla 1 pulgada" });
    const buscar = async (q: string) =>
      (await buscarProductos(e.ctx.admin, e.ferreteria.id, { q })).productos.map((p) => p.codigo);
    expect(await buscar("tornillo 1/4")).toEqual(["TOR-14"]);
    expect(await buscar("DRYWALL")).toEqual(["TOR-14"]);
    expect(await buscar("pun")).toEqual(["PUN-1"]);
    expect(await buscar("7701")).toEqual(["TOR-14"]);
  });

  it("cuenta los productos en o por debajo del mínimo", async () => {
    const id = await crear(e.ctx.admin, e.ferreteria.id, { stockMinimo: "10" }, "50");
    await crear(e.ctx.admin, e.ferreteria.id, { codigo: "SIN-MIN", stockMinimo: "0" }, "0");
    expect(await contarStockBajo(e.ctx.admin, e.ferreteria.id)).toBe(0);
    await ajustarStock(e.ctx.admin, id, { modo: "nuevo", cantidad: "10", motivo: "CONTEO" });
    expect(await contarStockBajo(e.ctx.admin, e.ferreteria.id)).toBe(1);
    const { productos } = await buscarProductos(e.ctx.admin, e.ferreteria.id, { stockBajo: true });
    expect(productos.map((p) => p.id)).toEqual([id]);
  });
});

describe("importación", () => {
  const csv = (texto: string) => new TextEncoder().encode(texto);

  it("si hay errores, los reporta por fila y no guarda nada", async () => {
    const archivo = csv(
      "Código;Nombre;Costo;Precio de venta;Stock;Unidad\n" +
        "A1;Bueno;100;200;5;unidad\n" +
        "A2;Sin precio;;;3;unidad\n" +
        "A1;Repetido;100;200;1;unidad\n" +
        "A3;Decimal malo;100;200;2,5;unidad\n" +
        "A4;Unidad rara;100;200;1;cajas\n",
    );
    const r = await ejecutarImportacion(e.ctx.admin, e.ferreteria.id, archivo, "productos.csv");
    expect(r.ok).toBe(false);
    expect(r.errores.map((x) => x.fila)).toEqual([3, 4, 5, 6]);
    expect(await prisma.producto.count()).toBe(0);
  });

  it("crea productos nuevos y categorías, calcula el precio con el margen y registra el stock", async () => {
    const archivo = csv(
      "Código,Nombre,Categoría,Costo,Precio de venta,Stock,Unidad,Venta fraccionada,IVA %\n" +
        "A1,Martillo,Herramientas,10000,,5,unidad,no,19\n" +
        'CAB-12,Cable #12,Eléctricos,1800,2500,"150,5",metro,sí,19\n',
    );
    const vista = await analizarImportacion(e.ctx.admin, e.ferreteria.id, archivo, "p.csv");
    expect(vista).toMatchObject({ ok: true, nuevos: 2, actualizados: 0, categoriasNuevas: ["Eléctricos", "Herramientas"] });
    expect(await prisma.producto.count()).toBe(0); // la vista previa no guarda

    await ejecutarImportacion(e.ctx.admin, e.ferreteria.id, archivo, "p.csv");
    const martillo = await prisma.producto.findFirstOrThrow({ where: { codigo: "A1" } });
    expect(martillo.precioVenta).toBe(13000); // 30 % sobre el costo
    const cable = await prisma.producto.findFirstOrThrow({ where: { codigo: "CAB-12" } });
    expect(Number(cable.stock)).toBe(150.5);
    expect(await sumaMovimientos(cable.id)).toBe(150.5);
    expect(await prisma.categoria.count({ where: { negocioId: e.ferreteria.id } })).toBe(2);
  });

  it("si el código ya existe, actualiza el producto en lugar de duplicarlo", async () => {
    const id = await crear(e.ctx.admin, e.ferreteria.id, { codigo: "TOR-1" }, "50");
    const archivo = csv("Código,Nombre,Precio de venta,Stock\nTOR-1,Tornillo 1/4 nuevo nombre,500,40\n");
    const r = await ejecutarImportacion(e.ctx.admin, e.ferreteria.id, archivo, "p.csv");
    expect(r).toMatchObject({ ok: true, nuevos: 0, actualizados: 1 });
    const p = await prisma.producto.findUniqueOrThrow({ where: { id } });
    expect(p.nombre).toBe("Tornillo 1/4 nuevo nombre");
    expect(p.precioVenta).toBe(500);
    expect(p.costo).toBe(250); // columna ausente: no cambia
    expect(Number(p.stock)).toBe(40);
    expect(await sumaMovimientos(id)).toBe(40);
    expect(await prisma.producto.count()).toBe(1);
  });

  it("el cajero no puede importar", async () => {
    await expect(
      ejecutarImportacion(e.ctx.cajero, e.motos.id, csv("Código,Nombre,Precio de venta\nA,B,1\n"), "p.csv"),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });
});
