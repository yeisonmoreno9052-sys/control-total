// Fotos de productos: quién las pone, quién las ve y que no se crucen entre empresas ni negocios.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/datos/cliente";
import { guardarFotoPorArchivo, guardarFotoProducto, obtenerFotoProducto } from "@/lib/datos/fotos-producto";
import { crearProducto } from "@/lib/datos/inventario";
import { guardarPreferenciasVenta } from "@/lib/datos/negocios";
import { botonesRapidos, buscarProductos, catalogoCaja, contarFotos, obtenerProducto } from "@/lib/datos/productos";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

// Encabezado de un WEBP de verdad (lo que manda la tablet después de achicar la foto).
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);

async function tinto(negocioId = e.motos.id) {
  const r = await crearProducto(
    e.ctx.admin,
    negocioId,
    esquemaProducto.parse({
      codigo: "TINTO", nombre: "Tinto", costo: "300", precioVenta: "1500", stockMinimo: "0",
      unidad: "UNIDAD", fraccionado: false, porcentajeIva: 0, condicion: "NUEVO", controlaStock: false, botonRapido: true,
    }),
    "0",
  );
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

describe("fotos de productos", () => {
  it("el administrador pone la foto y la caja la recibe con su dirección", async () => {
    const id = await tinto();
    expect((await obtenerProducto(e.ctx.admin, id))?.fotoUrl).toBeNull();

    expect(await guardarFotoProducto(e.ctx.admin, id, WEBP)).toMatchObject({ ok: true });
    const url = (await obtenerProducto(e.ctx.admin, id))?.fotoUrl;
    expect(url).toMatch(new RegExp(`^/api/productos/${id}/foto\\?v=\\d+$`));

    // El cajero del negocio la ve en los botones, en la copia sin internet y al pedir la imagen.
    await guardarPreferenciasVenta(e.ctx.admin, e.motos.id, { ivaPorDefecto: "0", botonesRapidos: true });
    expect((await botonesRapidos(e.ctx.cajero, e.motos.id))[0].fotoUrl).toBe(url);
    expect((await catalogoCaja(e.ctx.cajero, e.motos.id, null)).productos[0].fotoUrl).toBe(url);
    const foto = await obtenerFotoProducto(e.ctx.cajero, id);
    expect(foto?.tipo).toBe("image/webp");
    expect(new Uint8Array(foto!.bytes)).toEqual(WEBP);
  });

  it("quitar la foto la borra", async () => {
    const id = await tinto();
    await guardarFotoProducto(e.ctx.admin, id, WEBP);
    expect(await guardarFotoProducto(e.ctx.admin, id, null)).toMatchObject({ ok: true });
    expect((await obtenerProducto(e.ctx.admin, id))?.fotoUrl).toBeNull();
    expect(await obtenerFotoProducto(e.ctx.admin, id)).toBeNull();
    expect(await prisma.fotoProducto.count()).toBe(0);
  });

  it("rechaza lo que no es imagen y las fotos muy pesadas", async () => {
    const id = await tinto();
    expect(await guardarFotoProducto(e.ctx.admin, id, new TextEncoder().encode("<svg onload=alert(1)>"))).toMatchObject({ ok: false });
    const pesada = new Uint8Array(300 * 1024);
    pesada.set(WEBP);
    expect(await guardarFotoProducto(e.ctx.admin, id, pesada)).toMatchObject({ ok: false });
    expect(await prisma.fotoProducto.count()).toBe(0);
  });

  it("el cajero no puede cambiarla", async () => {
    const id = await tinto();
    await expect(guardarFotoProducto(e.ctx.cajero, id, WEBP)).rejects.toThrow();
  });

  it("no se ve ni se cambia desde otra empresa ni desde un negocio sin permiso", async () => {
    const id = await tinto();
    await guardarFotoProducto(e.ctx.admin, id, WEBP);

    expect(await obtenerFotoProducto(e.ctx.adminOtra, id)).toBeNull();
    expect(await obtenerFotoProducto(e.ctx.socio, id)).toBeNull(); // el socio solo tiene la ferretería
    expect(await guardarFotoProducto(e.ctx.adminOtra, id, null)).toMatchObject({ ok: false });
    expect(await guardarFotoProducto(e.ctx.socio, id, null)).toMatchObject({ ok: false });
    expect(await obtenerFotoProducto(e.ctx.admin, id)).not.toBeNull();
  });

  it("varias de una vez: el nombre del archivo dice de qué producto es", async () => {
    const id = await tinto();
    expect(await guardarFotoPorArchivo(e.ctx.admin, e.motos.id, "Tinto.jpg", WEBP)).toMatchObject({ ok: true, id, producto: "Tinto" });
    expect(await guardarFotoPorArchivo(e.ctx.admin, e.motos.id, "C001 tintó.webp", WEBP)).toMatchObject({ ok: true, id });
    expect(await guardarFotoPorArchivo(e.ctx.admin, e.motos.id, "TINTO.jpg", WEBP)).toMatchObject({ ok: true, id });
    expect(await guardarFotoPorArchivo(e.ctx.admin, e.motos.id, "Empanada.jpg", WEBP)).toMatchObject({ ok: false });
    expect((await obtenerProducto(e.ctx.admin, id))?.fotoUrl).not.toBeNull();
  });

  it("encuentra el producto aunque el archivo no tenga tildes ni signos", async () => {
    const r = await crearProducto(
      e.ctx.admin,
      e.motos.id,
      esquemaProducto.parse({
        codigo: "C022", nombre: "Torta (porción) de Buñuelo", costo: "0", precioVenta: "3500", stockMinimo: "0",
        unidad: "UNIDAD", fraccionado: false, porcentajeIva: 0, condicion: "NUEVO", controlaStock: false,
      }),
      "0",
    );
    if (!r.ok) throw new Error(r.error);
    expect(await guardarFotoPorArchivo(e.ctx.admin, e.motos.id, "C022 Torta porcion de Bunuelo.jpg", WEBP)).toMatchObject({ ok: true, id: r.id });
    // Y con la tilde escrita "a la Mac" (letra + tilde aparte).
    expect(await guardarFotoPorArchivo(e.ctx.admin, e.motos.id, "Torta (porcio\u0301n) de Bun\u0303uelo.png", WEBP)).toMatchObject({ ok: true, id: r.id });
  });

  it("si el archivo trae nombre, no cae en otro producto aunque el código coincida", async () => {
    const id = await tinto(); // código TINTO
    await prisma.producto.update({ where: { id }, data: { codigo: "C002" } });
    // En el archivo C002 es "Tinto grande", pero en esta tienda C002 es "Tinto": no se pone.
    expect(await guardarFotoPorArchivo(e.ctx.admin, e.motos.id, "C002 Tinto grande.jpg", WEBP)).toMatchObject({ ok: false });
    expect(await guardarFotoPorArchivo(e.ctx.admin, e.motos.id, "C002.jpg", WEBP)).toMatchObject({ ok: true, id });
  });

  it("varias de una vez no llega a otro negocio, otra empresa ni a un cajero sin permiso", async () => {
    await tinto();
    expect(await guardarFotoPorArchivo(e.ctx.admin, e.ferreteria.id, "TINTO.jpg", WEBP)).toMatchObject({ ok: false });
    await expect(guardarFotoPorArchivo(e.ctx.adminOtra, e.motos.id, "TINTO.jpg", WEBP)).rejects.toThrow();
    await expect(guardarFotoPorArchivo(e.ctx.socio, e.motos.id, "TINTO.jpg", WEBP)).rejects.toThrow();
    await expect(guardarFotoPorArchivo(e.ctx.cajero, e.motos.id, "TINTO.jpg", WEBP)).rejects.toThrow();
    expect(await prisma.fotoProducto.count()).toBe(0);
  });
});

describe("poner fotos (lista sin foto primero)", () => {
  it("separa los que tienen foto de los que no, solo en el negocio pedido", async () => {
    const conFoto = await tinto();
    await guardarFotoProducto(e.ctx.admin, conFoto, WEBP);
    const r = await crearProducto(
      e.ctx.admin,
      e.motos.id,
      esquemaProducto.parse({
        codigo: "AGUA", nombre: "Agua", costo: "500", precioVenta: "2000", stockMinimo: "0",
        unidad: "UNIDAD", fraccionado: false, porcentajeIva: 0, condicion: "NUEVO", controlaStock: false, botonRapido: false,
      }),
      "0",
    );
    if (!r.ok) throw new Error(r.error);
    await tinto(e.ferreteria.id);

    expect(await contarFotos(e.ctx.admin, e.motos.id)).toEqual({ sin: 1, con: 1 });
    const sin = await buscarProductos(e.ctx.admin, e.motos.id, { foto: "sin" });
    expect(sin.productos.map((p) => p.id)).toEqual([r.id]);
    const con = await buscarProductos(e.ctx.admin, e.motos.id, { foto: "con" });
    expect(con.productos.map((p) => p.id)).toEqual([conFoto]);
  });
});

describe("foto de una prenda con tallas", () => {
  async function blusa() {
    const { crearPrenda } = await import("@/lib/datos/prendas");
    const r = await crearPrenda(e.ctx.admin, e.motos.id, {
      nombre: "Blusa Lina", costo: "24.000", precioVenta: "45.000", porcentajeIva: "0", stockMinimo: "0",
      tallas: ["S", "M", "L"], colores: ["Negro", "Rosado"], cantidades: {},
    });
    if (!r.ok) throw new Error(r.error);
    const variantes = await prisma.producto.findMany({ where: { prendaId: r.prendaId }, select: { id: true, talla: true, color: true } });
    const de = (talla: string, color: string) => variantes.find((v) => v.talla === talla && v.color === color)!.id;
    return { de, variantes };
  }
  const conFoto = async () =>
    (await prisma.producto.findMany({ where: { fotoEn: { not: null } }, select: { talla: true, color: true } }))
      .map((p) => `${p.talla}-${p.color}`)
      .sort();

  it("la foto de una talla queda en todas las tallas del mismo color, no en los otros colores", async () => {
    const { de } = await blusa();
    const r = await guardarFotoProducto(e.ctx.admin, de("M", "Negro"), WEBP);
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.ids).toHaveLength(3);
    expect(await conFoto()).toEqual(["L-Negro", "M-Negro", "S-Negro"]);
    expect(await prisma.fotoProducto.count()).toBe(3);
    expect(new Uint8Array((await obtenerFotoProducto(e.ctx.cajero, de("L", "Negro")))!.bytes)).toEqual(WEBP);

    // El otro color tiene su propia foto.
    await guardarFotoProducto(e.ctx.admin, de("S", "Rosado"), WEBP);
    expect(await conFoto()).toHaveLength(6);

    // Quitarla la quita de las tallas de ese color.
    await guardarFotoProducto(e.ctx.admin, de("L", "Rosado"), null);
    expect(await conFoto()).toEqual(["L-Negro", "M-Negro", "S-Negro"]);
  });

  it("con soloEste se toca únicamente esa talla", async () => {
    const { de } = await blusa();
    await guardarFotoProducto(e.ctx.admin, de("M", "Negro"), WEBP, { soloEste: true });
    expect(await conFoto()).toEqual(["M-Negro"]);
  });

  it("no pasa a tallas desactivadas", async () => {
    const { de } = await blusa();
    await prisma.producto.update({ where: { id: de("S", "Negro") }, data: { activo: false } });
    await guardarFotoProducto(e.ctx.admin, de("M", "Negro"), WEBP);
    expect(await conFoto()).toEqual(["L-Negro", "M-Negro"]);
  });
});
