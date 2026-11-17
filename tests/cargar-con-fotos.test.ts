// Cargar productos al inventario con fotos: lo que propone la IA, cómo se compara
// con el inventario, cómo se guarda (crear / sumar), el límite del mes y el
// aislamiento entre empresas y negocios. La IA se simula.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado, datosDe } from "@/lib/datos/alcance";
import { prisma } from "@/lib/datos/cliente";
import { cargarContexto, type Contexto } from "@/lib/datos/contexto";
import { crearProducto } from "@/lib/datos/inventario";
import { estadoFotos } from "@/lib/datos/lectura-factura";
import {
  barrasValidas,
  categoriaParecida,
  guardarProductosDeFotos,
  leerProductosConFoto,
  type ProductoRevisado,
} from "@/lib/datos/lectura-productos";
import type { LectorProductos } from "@/lib/ia/lector";
import type { ProductosLeidos, ProductoVisto } from "@/lib/ia/productos";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

// Una foto JPEG mínima (los primeros bytes son los que se revisan).
const FOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

function visto(datos: Partial<ProductoVisto>): ProductoVisto {
  return {
    foto: 1,
    nombre: "Producto",
    marca: null,
    codigoBarras: null,
    precio: null,
    cantidad: null,
    categoria: null,
    soloEsteProducto: true,
    ...datos,
  };
}

function lectorFalso(productos: ProductoVisto[], nota: string | null = null) {
  const leidos: ProductosLeidos = { productos, nota };
  const lector: LectorProductos & { llamadas: number; categorias: string[] } = {
    modelo: "claude-opus-5-5",
    llamadas: 0,
    categorias: [],
    async leerProductos(_fotos, categorias) {
      lector.llamadas++;
      lector.categorias = categorias;
      return { ok: true, leidos, uso: { modelo: "claude-opus-5-5", tokensEntrada: 15000, tokensSalida: 1500 } };
    },
  };
  return lector;
}

async function activarModulo(empresaId: string, limite = 50) {
  await prisma.empresa.update({
    where: { id: empresaId },
    data: { modulosActivos: { push: "FACTURA_FOTO" }, limiteFotosMes: limite },
  });
}

async function recargar(ctx: Contexto) {
  const nuevo = await cargarContexto(ctx.usuarioId);
  if (!nuevo) throw new Error("sin contexto");
  return nuevo;
}

async function producto(negocioId: string, datos: Record<string, unknown>, stock = "5") {
  const r = await crearProducto(
    e.ctx.admin,
    negocioId,
    esquemaProducto.parse({
      costo: "1000",
      precioVenta: "2000",
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

function revisado(datos: Partial<ProductoRevisado>): ProductoRevisado {
  return {
    clave: "a",
    accion: "crear",
    productoId: null,
    nombre: "Producto",
    codigoBarras: null,
    categoriaId: null,
    categoriaNueva: null,
    precioVenta: 2500,
    costo: 0,
    cantidad: "",
    ...datos,
  };
}

describe("cálculos", () => {
  it("solo acepta códigos de barras de 8 a 14 dígitos", () => {
    expect(barrasValidas("7702025 123456")).toBe("7702025123456");
    expect(barrasValidas("12345")).toBeNull();
    expect(barrasValidas("ABC12345678")).toBeNull();
    expect(barrasValidas(null)).toBeNull();
  });

  it("reconoce la categoría aunque cambien tildes, mayúsculas o una palabra", () => {
    const categorias = [
      { id: "1", nombre: "Bebidas frías" },
      { id: "2", nombre: "Paquetes y snacks" },
    ];
    expect(categoriaParecida("bebidas frias", categorias)?.id).toBe("1");
    expect(categoriaParecida("Snacks y paquetes", categorias)?.id).toBe("2");
    expect(categoriaParecida("Panadería", categorias)).toBeNull();
  });
});

describe("leer fotos de productos", () => {
  it("propone los productos, reconoce los que ya existen y la categoría del negocio", async () => {
    await activarModulo(e.camila.id);
    const admin = await recargar(e.ctx.admin);
    await prisma.categoria.create({ data: { empresaId: e.camila.id, negocioId: e.motos.id, nombre: "Bebidas frías" } });
    const agua = await producto(e.motos.id, { codigo: "A1", nombre: "Agua Cristal 600ml", precioVenta: "2500" }, "3");
    const gaseosa = await producto(e.motos.id, { codigo: "G1", codigoBarras: "7702090012345", nombre: "Colombiana grande" });

    const lector = lectorFalso([
      visto({ foto: 1, nombre: "Galletas Festival fresa x6", marca: "Festival", codigoBarras: "7702025123456", categoria: "Paquetes", cantidad: 6 }),
      visto({ foto: 2, nombre: "Agua Cristal 600 ml", categoria: "Bebidas frias", precio: 2800 }),
      visto({ foto: 3, nombre: "Gaseosa Colombiana 1.5 L", codigoBarras: "7702090012345" }),
    ]);
    const r = await leerProductosConFoto(admin, e.motos.id, [FOTO, FOTO, FOTO], lector);
    if (!r.ok) throw new Error(r.error);
    expect(lector.categorias).toEqual(["Bebidas frías"]);
    const [galletas, aguaLeida, gaseosaLeida] = r.productos;
    expect(galletas).toMatchObject({ foto: 0, existente: null, categoriaId: null, categoriaNueva: "Paquetes", cantidad: "6", usarFoto: true });
    expect(aguaLeida.existente?.id).toBe(agua);
    expect(aguaLeida.existente?.stock).toBe("3");
    expect(aguaLeida).toMatchObject({ foto: 1, precio: 2800, categoriaNueva: null });
    expect(aguaLeida.categoriaId).not.toBeNull();
    // Por código de barras, aunque el nombre sea distinto.
    expect(gaseosaLeida.existente?.id).toBe(gaseosa);

    // Una tanda de 3 fotos cuenta como UNA lectura del mes.
    expect((await estadoFotos(admin, true)).usadas).toBe(1);
  });

  it("respeta el límite del mes (compartido con las facturas) y no llama a la IA cuando se acabó", async () => {
    await activarModulo(e.camila.id, 1);
    const admin = await recargar(e.ctx.admin);
    const lector = lectorFalso([visto({ nombre: "Tinto" })]);
    expect((await leerProductosConFoto(admin, e.motos.id, [FOTO], lector)).ok).toBe(true);
    const r = await leerProductosConFoto(admin, e.motos.id, [FOTO], lector);
    expect(r.ok).toBe(false);
    expect(lector.llamadas).toBe(1);
  });

  it("si no ve productos, avisa con un mensaje claro", async () => {
    await activarModulo(e.camila.id);
    const admin = await recargar(e.ctx.admin);
    const r = await leerProductosConFoto(admin, e.motos.id, [FOTO], lectorFalso([], "La foto 1 está borrosa"));
    expect(r).toMatchObject({ ok: false });
  });

  it("con el módulo apagado, sin clave, sin fotos o con más de 10 no se lee nada", async () => {
    const lector = lectorFalso([visto({})]);
    expect((await leerProductosConFoto(e.ctx.admin, e.motos.id, [FOTO], lector)).ok).toBe(false);
    await activarModulo(e.camila.id);
    const admin = await recargar(e.ctx.admin);
    expect((await leerProductosConFoto(admin, e.motos.id, [FOTO], null)).ok).toBe(false);
    expect((await leerProductosConFoto(admin, e.motos.id, [], lector)).ok).toBe(false);
    expect((await leerProductosConFoto(admin, e.motos.id, Array(11).fill(FOTO), lector)).ok).toBe(false);
    expect((await leerProductosConFoto(admin, e.motos.id, [new Uint8Array([1, 2, 3, 4])], lector)).ok).toBe(false);
    expect(lector.llamadas).toBe(0);
  });
});

describe("guardar lo revisado", () => {
  it("crea los nuevos con su cantidad, código de barras, categoría nueva y foto", async () => {
    const r = await guardarProductosDeFotos(
      e.ctx.admin,
      e.motos.id,
      [
        revisado({ clave: "g", nombre: "Galletas Festival fresa x6", codigoBarras: "7702025123456", categoriaNueva: "Paquetes", cantidad: "24", precioVenta: 3500 }),
        revisado({ clave: "p", nombre: "Papas Margarita", categoriaNueva: "paquetes", precioVenta: 2000 }),
        revisado({ clave: "t", nombre: "Tinto", precioVenta: 1500 }),
      ],
      new Map([["g", FOTO]]),
    );
    expect(r.every((x) => x.ok)).toBe(true);
    const productos = await datosDe(e.ctx.admin).producto.findMany({ where: { negocioId: e.motos.id }, orderBy: { nombre: "asc" } });
    const [galletas, papas, tinto] = productos;
    expect(galletas).toMatchObject({ codigo: "7702025123456", codigoBarras: "7702025123456", precioVenta: 3500, unidad: "UNIDAD" });
    expect(galletas.stock.toString()).toBe("24");
    expect(galletas.fotoEn).not.toBeNull();
    expect(papas.codigo).toBe("FOT-0001");
    expect(tinto.codigo).toBe("FOT-0002");
    expect(tinto.stock.toString()).toBe("0");
    // "Paquetes" y "paquetes" son la misma categoría: se crea una sola vez.
    expect(galletas.categoriaId).not.toBeNull();
    expect(papas.categoriaId).toBe(galletas.categoriaId);
    expect(await datosDe(e.ctx.admin).categoria.count({ where: { negocioId: e.motos.id } })).toBe(1);
    // El stock inicial queda explicado por su movimiento.
    expect(await datosDe(e.ctx.admin).movimientoInventario.count({ where: { productoId: galletas.id } })).toBe(1);
  });

  it("en los que ya existían suma al stock, cambia el precio con auditoría y solo pone foto si no tenía", async () => {
    const agua = await producto(e.motos.id, { codigo: "A1", nombre: "Agua Cristal 600ml", precioVenta: "2500" }, "3");
    const r = await guardarProductosDeFotos(
      e.ctx.admin,
      e.motos.id,
      [revisado({ clave: "a", accion: "sumar", productoId: agua, nombre: "Agua Cristal 600 ml", cantidad: "12", precioVenta: 2800 })],
      new Map([["a", FOTO]]),
    );
    expect(r).toEqual([{ clave: "a", ok: true, productoId: agua }]);
    const despues = await datosDe(e.ctx.admin).producto.findFirstOrThrow({ where: { id: agua } });
    expect(despues.stock.toString()).toBe("15");
    expect(despues.precioVenta).toBe(2800);
    expect(despues.nombre).toBe("Agua Cristal 600ml");
    expect(despues.fotoEn).not.toBeNull();
    const auditorias = await prisma.auditoria.findMany({ where: { entidadId: agua }, select: { accion: true } });
    expect(auditorias.map((a) => a.accion).sort()).toEqual(["AJUSTE_STOCK", "CAMBIO_PRECIO", "CREACION_PRODUCTO"]);
  });

  it("no guarda nuevos sin precio, ni repite un código de barras que ya existe, y sigue con los demás", async () => {
    await producto(e.motos.id, { codigo: "G1", codigoBarras: "7702090012345", nombre: "Colombiana" });
    const r = await guardarProductosDeFotos(
      e.ctx.admin,
      e.motos.id,
      [
        revisado({ clave: "sin", nombre: "Sin precio", precioVenta: 0 }),
        revisado({ clave: "rep", nombre: "Gaseosa repetida", codigoBarras: "7702090012345" }),
        revisado({ clave: "dec", nombre: "Con decimales", cantidad: "1,5" }),
        revisado({ clave: "bien", nombre: "Empanada" }),
      ],
      new Map(),
    );
    expect(r.map((x) => [x.clave, x.ok])).toEqual([
      ["sin", false],
      ["rep", false],
      ["dec", false],
      ["bien", true],
    ]);
  });

  it("no suma a un producto que no se cuenta", async () => {
    const tinto = await producto(e.motos.id, { codigo: "T1", nombre: "Tinto", controlaStock: false }, "0");
    const r = await guardarProductosDeFotos(
      e.ctx.admin,
      e.motos.id,
      [revisado({ accion: "sumar", productoId: tinto, nombre: "Tinto", cantidad: "5" })],
      new Map(),
    );
    expect(r[0].ok).toBe(false);
  });
});

describe("aislamiento", () => {
  it("el cajero no puede leer fotos ni guardar productos así", async () => {
    await activarModulo(e.camila.id);
    const cajero = await recargar(e.ctx.cajero);
    await expect(leerProductosConFoto(cajero, e.motos.id, [FOTO], lectorFalso([visto({})]))).rejects.toThrow(AccesoDenegado);
    await expect(guardarProductosDeFotos(cajero, e.motos.id, [revisado({})], new Map())).rejects.toThrow(AccesoDenegado);
  });

  it("el socio de la ferretería no puede cargar productos en el negocio de motos", async () => {
    await activarModulo(e.camila.id);
    const socio = await recargar(e.ctx.socio);
    await expect(leerProductosConFoto(socio, e.motos.id, [FOTO], lectorFalso([visto({})]))).rejects.toThrow(AccesoDenegado);
    await expect(guardarProductosDeFotos(socio, e.motos.id, [revisado({})], new Map())).rejects.toThrow(AccesoDenegado);
  });

  it("solo reconoce productos del mismo negocio, y no suma a productos de otro negocio ni de otra empresa", async () => {
    await activarModulo(e.camila.id);
    const admin = await recargar(e.ctx.admin);
    const enMotos = await producto(e.motos.id, { codigo: "A1", nombre: "Agua Cristal 600 ml" });
    const adminOtra = await recargar(e.ctx.adminOtra);
    const rOtra = await crearProducto(
      adminOtra,
      e.tiendaOtra.id,
      esquemaProducto.parse({
        codigo: "A1", nombre: "Agua Cristal 600 ml", costo: "1", precioVenta: "2", stockMinimo: "0",
        unidad: "UNIDAD", fraccionado: false, porcentajeIva: 0, condicion: "NUEVO",
      }),
      "1",
    );
    if (!rOtra.ok) throw new Error(rOtra.error);

    const r = await leerProductosConFoto(admin, e.ferreteria.id, [FOTO], lectorFalso([visto({ nombre: "Agua Cristal 600 ml" })]));
    if (!r.ok) throw new Error(r.error);
    expect(r.productos[0].existente).toBeNull();

    const guardado = await guardarProductosDeFotos(
      admin,
      e.ferreteria.id,
      [
        revisado({ clave: "m", accion: "sumar", productoId: enMotos, cantidad: "5" }),
        revisado({ clave: "o", accion: "sumar", productoId: rOtra.id, cantidad: "5" }),
      ],
      new Map(),
    );
    expect(guardado.every((x) => !x.ok)).toBe(true);
    expect((await datosDe(admin).producto.findFirstOrThrow({ where: { id: enMotos } })).stock.toString()).toBe("5");
    expect((await datosDe(adminOtra).producto.findFirstOrThrow({ where: { id: rOtra.id } })).stock.toString()).toBe("1");
  });
});
