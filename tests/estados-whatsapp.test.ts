// Estados de WhatsApp: qué tallas y precio salen, el texto, el collage, la foto de la
// prenda y que no se crucen datos entre empresas ni negocios.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { prisma } from "@/lib/datos/cliente";
import { buscarPiezasEstado, guardarFotoPieza, listarNovedades, obtenerPiezaEstado } from "@/lib/datos/estados";
import { crearProducto } from "@/lib/datos/inventario";
import { crearPrenda } from "@/lib/datos/prendas";
import {
  agruparPiezas,
  aplicarDescuento,
  hayPromocion,
  leerTallas,
  nombreArchivo,
  porcentajeRebaja,
  rejillaCollage,
  resumirPieza,
  textoCollage,
  textoPieza,
  unirTallas,
  type VarianteEstado,
} from "@/lib/estados/piezas";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { claveVariante } from "@/lib/inventario/prendas";
import { crearEscenario, type Escenario } from "./escenario";

const v = (datos: Partial<VarianteEstado> & { id: string }): VarianteEstado => ({
  nombre: "Jean - 8",
  prenda: "Jean",
  prendaId: "P1",
  descripcion: null,
  talla: "8",
  precioVenta: 89900,
  stock: "1",
  controlaStock: true,
  fotoUrl: null,
  ...datos,
});

describe("Ayudas del Estado (sin base de datos)", () => {
  it("junta las tallas con stock, sin repetir, con el precio más bajo y la primera foto", () => {
    const pieza = resumirPieza([
      v({ id: "a", talla: "6", stock: "0", precioVenta: 79900 }),
      v({ id: "b", talla: "8", stock: "2" }),
      v({ id: "c", talla: "8 ", stock: "1", fotoUrl: "/f/c" }),
      v({ id: "d", talla: "10", stock: "1.000", precioVenta: 95000 }),
    ]);
    expect(pieza).toMatchObject({ productoId: "a", nombre: "Jean", tallas: ["8", "10"], precio: 89900, fotoUrl: "/f/c" });
  });

  it("si no queda stock igual muestra la prenda, sin tallas", () => {
    const pieza = resumirPieza([v({ id: "a", stock: "0" }), v({ id: "b", talla: "10", stock: "0" })]);
    expect(pieza?.tallas).toEqual([]);
    expect(pieza?.precio).toBe(89900);
  });

  it("un producto suelto usa su nombre", () => {
    const pieza = resumirPieza([v({ id: "x", prendaId: null, prenda: null, nombre: "Correa de cuero", talla: null })]);
    expect(pieza).toMatchObject({ nombre: "Correa de cuero", tallas: [] });
  });

  it("agrupa por prenda conservando el orden de la más nueva y respeta el límite", () => {
    const piezas = agruparPiezas(
      [
        v({ id: "1", prendaId: "A", prenda: "Blusa" }),
        v({ id: "2", prendaId: null, nombre: "Correa" }),
        v({ id: "3", prendaId: "A", prenda: "Blusa", talla: "M" }),
        v({ id: "4", prendaId: "B", prenda: "Falda" }),
      ],
      2,
    );
    expect(piezas.map((p) => p.nombre)).toEqual(["Blusa", "Correa"]);
    expect(piezas[0].tallas).toEqual(["M", "8"]);
  });

  it("lee y une tallas como las escribe la gente", () => {
    expect(leerTallas("6, 8 y 10")).toEqual(["6", "8", "10"]);
    expect(leerTallas("S M L")).toEqual(["S", "M", "L"]);
    expect(leerTallas("s/m;l")).toEqual(["s", "m", "l"]);
    expect(leerTallas("  ")).toEqual([]);
    expect(unirTallas(["6", "8", "10"])).toBe("6, 8 y 10");
    expect(unirTallas(["S"])).toBe("S");
  });

  it("calcula la rebaja solo cuando el precio de oferta es menor", () => {
    expect(porcentajeRebaja(159900, 119900)).toBe(25);
    expect(porcentajeRebaja(100000, 100000)).toBeNull();
    expect(porcentajeRebaja(100000, 120000)).toBeNull();
    expect(porcentajeRebaja(0, 1)).toBeNull();
  });

  it("arma el texto de una prenda, normal y en oferta", () => {
    const base = { nombre: "Jean tiro alto", detalle: "Bota recta", tallas: ["6", "8", "10"], precio: 89900, oferta: null, etiqueta: "ninguna" as const, telefono: "300 123 4567" };
    expect(textoPieza(base)).toBe(
      "*Jean tiro alto*\nBota recta\nTallas: 6, 8 y 10\nPrecio: *$ 89.900*\nEscríbenos al 300 123 4567 📲",
    );
    const oferta = textoPieza({ ...base, detalle: "", precio: 159900, oferta: 119900, etiqueta: "ultimas", telefono: "" });
    expect(oferta).toBe("🔥 ¡Últimas unidades!\n*Jean tiro alto*\nTallas: 6, 8 y 10\nAntes $ 159.900, ahora *$ 119.900* (-25 %)");
  });

  it("arma el texto del collage", () => {
    const texto = textoCollage({
      titulo: "Llegó mercancía nueva",
      nota: "Pregunta por tu talla",
      telefono: "300 123 4567",
      piezas: [
        { nombre: "Jean", precio: 89900, oferta: 69900, fotoUrl: null },
        { nombre: "Blusa", precio: 59900, oferta: null, fotoUrl: null },
      ],
    });
    expect(texto).toBe(
      "✨ *Llegó mercancía nueva* ✨\n\n• Jean: ~$ 89.900~ *$ 69.900*\n• Blusa: $ 59.900\n\nPregunta por tu talla\nEscríbenos al 300 123 4567 📲",
    );
  });

  it("aplica un descuento general redondeado y sabe si hay promoción", () => {
    expect(aplicarDescuento(89900, 20)).toBe(71900);
    expect(aplicarDescuento(59900, 15)).toBe(50900);
    expect(aplicarDescuento(59900, null)).toBeNull();
    expect(aplicarDescuento(59900, 0)).toBeNull();
    expect(aplicarDescuento(59900, 100)).toBeNull();
    expect(hayPromocion({ piezas: [{ nombre: "a", precio: 100, oferta: 100, fotoUrl: null }] })).toBe(false);
    expect(hayPromocion({ piezas: [{ nombre: "a", precio: 100, oferta: 80, fotoUrl: null }] })).toBe(true);
  });

  it("acomoda la rejilla del collage y nombra el archivo", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => rejillaCollage(n))).toEqual([
      { columnas: 1, filas: 1 },
      { columnas: 2, filas: 1 },
      { columnas: 3, filas: 1 },
      { columnas: 2, filas: 2 },
      { columnas: 3, filas: 2 },
      { columnas: 3, filas: 2 },
    ]);
    expect(nombreArchivo("Jean tiro alto · Ñandú")).toBe("estado-jean-tiro-alto-nandu.png");
    expect(nombreArchivo("¡!")).toBe("estado-prenda.png");
  });
});

// Encabezado de un WEBP de verdad (lo que manda el navegador después de achicar la foto).
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterAll(() => prisma.$disconnect());

async function jean(negocioId = e.motos.id, ctx = e.ctx.admin) {
  const r = await crearPrenda(ctx, negocioId, {
    nombre: "Jean tiro alto",
    costo: "40.000",
    precioVenta: "89.900",
    porcentajeIva: "0",
    stockMinimo: "0",
    tallas: ["6", "8", "10"],
    colores: ["Azul", "Negro"],
    cantidades: { [claveVariante("8", "Azul")]: "2", [claveVariante("10", "Negro")]: "1", [claveVariante("8", "Negro")]: "1" },
  });
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("Estados de WhatsApp con la base de datos", () => {
  it("una prenda sale con su nombre y solo las tallas que hay en stock", async () => {
    const r = await jean();
    const pieza = await obtenerPiezaEstado(e.ctx.cajero, r.id);
    expect(pieza).toMatchObject({ nombre: "Jean tiro alto", tallas: ["8", "10"], precio: 89900, prendaId: r.prendaId, fotoUrl: null });
  });

  it("la foto puesta desde el Estado queda en todas las tallas y colores", async () => {
    const r = await jean();
    expect(await guardarFotoPieza(e.ctx.admin, r.id, WEBP)).toMatchObject({ ok: true });
    const conFoto = await prisma.producto.count({ where: { prendaId: r.prendaId, fotoEn: { not: null } } });
    expect(conFoto).toBe(6);
    expect((await obtenerPiezaEstado(e.ctx.admin, r.id))?.fotoUrl).toMatch(/^\/api\/productos\/.+\/foto\?v=\d+$/);
  });

  it("el cajero sin permiso de editar productos no puede poner la foto", async () => {
    const r = await jean();
    await expect(guardarFotoPieza(e.ctx.cajero, r.id, WEBP)).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("las novedades salen de la más nueva a la más vieja, agrupadas y sin lo agotado", async () => {
    await jean();
    const correa = await crearProducto(
      e.ctx.admin,
      e.motos.id,
      esquemaProducto.parse({
        codigo: "CORREA", nombre: "Correa de cuero", costo: "10000", precioVenta: "35000", stockMinimo: "0",
        unidad: "UNIDAD", fraccionado: false, porcentajeIva: 0, condicion: "NUEVO",
      }),
      "3",
    );
    if (!correa.ok) throw new Error(correa.error);
    await crearProducto(
      e.ctx.admin,
      e.motos.id,
      esquemaProducto.parse({
        codigo: "AGOTADO", nombre: "Gorra agotada", costo: "1000", precioVenta: "20000", stockMinimo: "0",
        unidad: "UNIDAD", fraccionado: false, porcentajeIva: 0, condicion: "NUEVO",
      }),
      "0",
    );
    const novedades = await listarNovedades(e.ctx.admin, e.motos.id);
    expect(novedades.map((p) => p.nombre)).toEqual(["Correa de cuero", "Jean tiro alto"]);
    expect(novedades[1].tallas).toEqual(["8", "10"]);
  });

  it("busca cualquier prenda sin tildes, con todas sus tallas, aunque esté agotada", async () => {
    await jean();
    await crearPrenda(e.ctx.admin, e.motos.id, {
      nombre: "Pantalón café", costo: "1", precioVenta: "50.000", porcentajeIva: "0", stockMinimo: "0",
      tallas: ["S"], colores: [], cantidades: {},
    });
    const jeans = await buscarPiezasEstado(e.ctx.cajero, e.motos.id, "jean tiro");
    expect(jeans).toHaveLength(1);
    expect(jeans[0]).toMatchObject({ nombre: "Jean tiro alto", tallas: ["8", "10"] });
    const agotado = await buscarPiezasEstado(e.ctx.admin, e.motos.id, "pantalon cafe");
    expect(agotado).toMatchObject([{ nombre: "Pantalón café", tallas: [] }]);
    expect(await buscarPiezasEstado(e.ctx.admin, e.motos.id, " ")).toEqual([]);
    expect(await buscarPiezasEstado(e.ctx.adminOtra, e.motos.id, "jean")).toEqual([]);
  });

  it("no se ven prendas de otro negocio ni de otra empresa", async () => {
    const r = await jean();
    expect(await obtenerPiezaEstado(e.ctx.socio, r.id)).toBeNull();
    expect(await obtenerPiezaEstado(e.ctx.adminOtra, r.id)).toBeNull();
    expect(await listarNovedades(e.ctx.adminOtra, e.motos.id)).toEqual([]);
    await expect(guardarFotoPieza(e.ctx.adminOtra, r.id, WEBP)).resolves.toMatchObject({ ok: false });
    expect(await listarNovedades(e.ctx.socio, e.motos.id)).toEqual([]);
  });
});
