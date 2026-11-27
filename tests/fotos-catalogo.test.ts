// Fotos extra del catálogo en línea: por prenda y color, opcionales, con límite, y sin
// cruzarse entre empresas, negocios ni tiendas públicas.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { guardarConfigCatalogo } from "@/lib/datos/catalogo";
import { buscarTienda, fotoCatalogoPublica, obtenerTarjeta } from "@/lib/datos/catalogo-publico";
import { prisma } from "@/lib/datos/cliente";
import { agregarFotoCatalogo, MAX_FOTOS_EXTRA, obtenerFotoCatalogo, obtenerGaleria, quitarFotoCatalogo } from "@/lib/datos/fotos-catalogo";
import { guardarFotoProducto } from "@/lib/datos/fotos-producto";
import { crearPrenda } from "@/lib/datos/prendas";
import { claveVariante } from "@/lib/inventario/prendas";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterAll(() => prisma.$disconnect());

const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);

async function blusa(negocioId = e.motos.id, ctx = e.ctx.admin) {
  const r = await crearPrenda(ctx, negocioId, {
    nombre: "Blusa Valentina",
    costo: "24.000",
    precioVenta: "64.900",
    porcentajeIva: "0",
    stockMinimo: "1",
    tallas: ["S", "M"],
    colores: ["Vino tinto", "Negro"],
    cantidades: { [claveVariante("M", "Vino tinto")]: "3", [claveVariante("S", "Negro")]: "2" },
  });
  if (!r.ok) throw new Error(r.error);
  const productos = await prisma.producto.findMany({ where: { prendaId: r.prendaId }, select: { id: true, talla: true, color: true } });
  const de = (talla: string, color: string) => productos.find((p) => p.talla === talla && p.color === color)!.id;
  return { prendaId: r.prendaId, de };
}

describe("fotos extra del catálogo", () => {
  it("van por color: la principal sigue igual y las extra salen en la tarjeta del cliente", async () => {
    const b = await blusa();
    await guardarFotoProducto(e.ctx.admin, b.de("M", "Vino tinto"), WEBP);

    // Se agrega desde la talla S, pero queda para toda la prenda vino tinto.
    const r1 = await agregarFotoCatalogo(e.ctx.admin, b.de("S", "Vino tinto"), "vino tinto", WEBP);
    const r2 = await agregarFotoCatalogo(e.ctx.admin, b.de("S", "Vino tinto"), "Vino tinto", WEBP);
    const r3 = await agregarFotoCatalogo(e.ctx.admin, b.de("S", "Negro"), "Negro", WEBP);
    expect([r1.ok, r2.ok, r3.ok]).toEqual([true, true, true]);
    expect((await agregarFotoCatalogo(e.ctx.admin, b.de("S", "Negro"), "Rojo", WEBP)).ok).toBe(false);

    const galeria = (await obtenerGaleria(e.ctx.admin, b.de("M", "Negro")))!;
    const vino = galeria.find((g) => g.color === "Vino tinto")!;
    expect(vino.principal).toMatch(/\/api\/productos\/.+\/foto\?v=/);
    expect(vino.extras).toHaveLength(2);
    expect(galeria.find((g) => g.color === "Negro")!.extras).toHaveLength(1);

    await guardarConfigCatalogo(e.ctx.admin, e.motos.id, { activo: true, slug: "dbshop", whatsapp: "3001234567" });
    const tienda = (await buscarTienda("dbshop"))!;
    const t = (await obtenerTarjeta(tienda, b.prendaId))!;
    expect(t.fotosExtra.map((f) => f.color).sort()).toEqual(["Negro", "Vino tinto", "Vino tinto"]);
    // La tarjeta muestra la foto vino tinto: principal + 2 extra.
    expect(t.numFotos).toBe(3);
    const id = r1.ok ? r1.id : "";
    expect((await fotoCatalogoPublica(tienda, id))?.tipo).toBe("image/webp");

    // Se quita una y deja de salir.
    expect((await quitarFotoCatalogo(e.ctx.admin, id)).ok).toBe(true);
    expect(await fotoCatalogoPublica(tienda, id)).toBeNull();
    expect((await obtenerTarjeta(tienda, b.prendaId))!.numFotos).toBe(2);
  });

  it(`deja máximo ${MAX_FOTOS_EXTRA} extra por color y solo imágenes livianas`, async () => {
    const b = await blusa();
    for (let i = 0; i < MAX_FOTOS_EXTRA; i++) expect((await agregarFotoCatalogo(e.ctx.admin, b.de("M", "Vino tinto"), "Vino tinto", WEBP)).ok).toBe(true);
    const otra = await agregarFotoCatalogo(e.ctx.admin, b.de("M", "Vino tinto"), "Vino tinto", WEBP);
    expect(otra.ok).toBe(false);
    // El otro color tiene su propio cupo.
    expect((await agregarFotoCatalogo(e.ctx.admin, b.de("S", "Negro"), "Negro", WEBP)).ok).toBe(true);
    expect((await agregarFotoCatalogo(e.ctx.admin, b.de("S", "Negro"), "Negro", new Uint8Array([1, 2, 3]))).ok).toBe(false);
  });

  it("no se cruzan entre empresas, negocios ni tiendas, y el cajero no las cambia", async () => {
    const b = await blusa();
    const r = await agregarFotoCatalogo(e.ctx.admin, b.de("M", "Vino tinto"), "Vino tinto", WEBP);
    if (!r.ok) throw new Error(r.error);

    // Otra empresa no la ve, no la borra y no le agrega fotos a la prenda.
    expect(await obtenerFotoCatalogo(e.ctx.adminOtra, r.id)).toBeNull();
    expect((await quitarFotoCatalogo(e.ctx.adminOtra, r.id)).ok).toBe(false);
    expect((await agregarFotoCatalogo(e.ctx.adminOtra, b.de("M", "Vino tinto"), null, WEBP)).ok).toBe(false);
    expect(await obtenerGaleria(e.ctx.adminOtra, b.de("M", "Vino tinto"))).toBeNull();
    // El socio solo tiene la ferretería.
    expect(await obtenerFotoCatalogo(e.ctx.socio, r.id)).toBeNull();
    // El cajero del negocio la ve pero no la cambia.
    expect(await obtenerFotoCatalogo(e.ctx.cajero, r.id)).not.toBeNull();
    await expect(quitarFotoCatalogo(e.ctx.cajero, r.id)).rejects.toThrow(AccesoDenegado);

    // La tienda pública de otra empresa no la sirve.
    await guardarConfigCatalogo(e.ctx.adminOtra, e.tiendaOtra.id, { activo: true, slug: "otra-tienda", whatsapp: "3001234567" });
    const ajena = (await buscarTienda("otra-tienda"))!;
    expect(await fotoCatalogoPublica(ajena, r.id)).toBeNull();

    // Si la prenda se desactiva, su foto deja de salir en el catálogo.
    await guardarConfigCatalogo(e.ctx.admin, e.motos.id, { activo: true, slug: "dbshop", whatsapp: "3001234567" });
    const tienda = (await buscarTienda("dbshop"))!;
    expect(await fotoCatalogoPublica(tienda, r.id)).not.toBeNull();
    await prisma.producto.updateMany({ where: { prendaId: b.prendaId }, data: { activo: false } });
    expect(await fotoCatalogoPublica(tienda, r.id)).toBeNull();
  });
});
