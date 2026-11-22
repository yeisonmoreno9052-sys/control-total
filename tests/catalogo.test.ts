// Catálogo en línea: link, WhatsApp, tarjetas por prenda, promociones, avisos de talla,
// conteo de vistas y, sobre todo, que la página pública no muestre nada que no deba.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import {
  armarTarjetas,
  cuentaRegresiva,
  errorSlug,
  mensajeLlego,
  mensajePedido,
  numeroWhatsapp,
  ordenTalla,
  precioConPromo,
  sugerirSlug,
  type FilaCatalogo,
} from "@/lib/catalogo/catalogo";
import { avisosPendientes, estadisticasCatalogo, guardarConfigCatalogo, marcarAvisado } from "@/lib/datos/catalogo";
import {
  buscarTienda,
  categoriasCatalogo,
  crearAviso,
  fotoPublica,
  listarCatalogo,
  obtenerTarjeta,
  registrarEvento,
} from "@/lib/datos/catalogo-publico";
import { prisma } from "@/lib/datos/cliente";
import { crearProducto } from "@/lib/datos/inventario";
import { crearPrenda, registrarLlegada } from "@/lib/datos/prendas";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { claveVariante } from "@/lib/inventario/prendas";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterAll(() => prisma.$disconnect());

const fila = (x: Partial<FilaCatalogo>): FilaCatalogo => ({
  id: "p1",
  nombre: "Blusa - M",
  prendaId: "B1",
  prenda: "Blusa",
  talla: "M",
  color: null,
  precioVenta: 45000,
  stock: 1,
  controlaStock: true,
  fotoEn: null,
  creadoEn: new Date("2026-01-01T00:00:00Z"),
  categoria: "Mujer - Blusas",
  promo: null,
  ...x,
});

describe("Ayudas del catálogo", () => {
  it("arma y revisa el link", () => {
    expect(sugerirSlug("DB Shop!")).toBe("db-shop");
    expect(sugerirSlug("Ferretería El Tornillo")).toBe("ferreteria-el-tornillo");
    expect(errorSlug("dbshop")).toBeNull();
    expect(errorSlug("db")).not.toBeNull();
    expect(errorSlug("DB Shop")).not.toBeNull();
    expect(errorSlug("api")).not.toBeNull();
  });

  it("entiende los números de WhatsApp de Colombia", () => {
    expect(numeroWhatsapp("300 123 4567")).toBe("573001234567");
    expect(numeroWhatsapp("+57 300-123-4567")).toBe("573001234567");
    expect(numeroWhatsapp("604 444 5566")).toBeNull();
    expect(numeroWhatsapp("")).toBeNull();
  });

  it("escribe el pedido de una prenda y el de la bolsa con su total", () => {
    const uno = mensajePedido("DB Shop", [{ nombre: "Jean Rosalía", talla: "8", color: "Negro", cantidad: 1, precio: 85000, link: "https://x/p/1" }]);
    expect(uno).toContain("Jean Rosalía");
    expect(uno).toContain("Talla: *8*");
    expect(uno).toContain("$ 85.000");
    const bolsa = mensajePedido("DB Shop", [
      { nombre: "Jean", talla: "8", color: "Negro", cantidad: 2, precio: 85000 },
      { nombre: "Blusa", talla: "M", color: null, cantidad: 1, precio: 45000 },
    ]);
    expect(bolsa).toContain("1. Jean · Talla 8 · Negro x2 = $ 170.000");
    expect(bolsa).toContain("*Total: $ 215.000* (3 prendas)");
    expect(mensajeLlego("DB Shop", { cliente: "Laura Gómez", nombre: "Jean", talla: "8", color: "Negro" })).toContain("¡Hola Laura!");
  });

  it("aplica la promoción igual que la caja y cuenta los días", () => {
    const p = { nombre: "Black", tipo: "PORCENTAJE" as const, valor: 20, desde: "2026-11-20", hasta: "2026-11-30" };
    expect(precioConPromo(85000, p, "2026-11-22")).toBe(68000);
    expect(precioConPromo(85000, p, "2026-12-01")).toBeNull();
    expect(precioConPromo(85000, { ...p, tipo: "PRECIO", valor: 90000 }, "2026-11-22")).toBeNull();
    expect(cuentaRegresiva("2026-11-22", "2026-11-22")).toBe("¡Último día!");
    expect(cuentaRegresiva("2026-11-23", "2026-11-22")).toBe("Termina mañana");
    expect(cuentaRegresiva("2026-11-25", "2026-11-22")).toBe("Termina en 3 días");
    expect(cuentaRegresiva("2026-12-30", "2026-11-22")).toBe("Hasta el 30/12");
  });

  it("ordena tallas de letra y de número", () => {
    expect(["XL", "S", "10", "M", "8", "Única"].sort(ordenTalla)).toEqual(["S", "M", "XL", "8", "10", "Única"]);
  });

  it("junta las tallas en una tarjeta, marca las agotadas y esconde lo que no tiene stock", () => {
    const t = armarTarjetas(
      [
        fila({ id: "a", talla: "M", stock: 2 }),
        fila({ id: "b", talla: "S", stock: 0 }),
        fila({ id: "c", prendaId: "B2", prenda: "Falda", talla: "L", stock: 0 }),
      ],
      "2026-11-22",
      new Date("2026-11-22T12:00:00Z"),
    );
    expect(t).toHaveLength(1);
    expect(t[0].nombre).toBe("Blusa");
    expect(t[0].tallas).toEqual([
      { talla: "S", disponible: false },
      { talla: "M", disponible: true },
    ]);
    expect(t[0].ultimas).toBe(true);
    expect(t[0].nuevo).toBe(false);
  });
});

async function prenderCatalogo(slug = "tienda-motos", negocioId = e.motos.id, ctx = e.ctx.admin) {
  const r = await guardarConfigCatalogo(ctx, negocioId, { activo: true, slug, whatsapp: "300 123 4567", mostrarCantidad: false });
  if (!r.ok) throw new Error(r.error);
}

async function blusa(negocioId = e.motos.id, ctx = e.ctx.admin) {
  const r = await crearPrenda(ctx, negocioId, {
    nombre: "Blusa Lina",
    costo: "24.000",
    precioVenta: "45.000",
    porcentajeIva: "0",
    stockMinimo: "1",
    tallas: ["S", "M"],
    colores: ["Negro"],
    cantidades: { [claveVariante("M", "Negro")]: "3" },
  });
  if (!r.ok) throw new Error(r.error);
  return r.prendaId;
}

describe("Configurar el catálogo", () => {
  it("solo administrador o socio lo prenden, y el link no se repite entre empresas", async () => {
    await expect(guardarConfigCatalogo(e.ctx.cajero, e.motos.id, { activo: true, slug: "x-tienda", whatsapp: "3001234567" })).rejects.toThrow(AccesoDenegado);
    // El socio solo tiene la ferretería.
    await expect(guardarConfigCatalogo(e.ctx.socio, e.motos.id, { activo: true, slug: "x-tienda", whatsapp: "3001234567" })).rejects.toThrow(AccesoDenegado);
    await prenderCatalogo("dbshop");
    const repetido = await guardarConfigCatalogo(e.ctx.adminOtra, e.tiendaOtra.id, { activo: true, slug: "dbshop", whatsapp: "3001234567" });
    expect(repetido.ok).toBe(false);
    const sinNumero = await guardarConfigCatalogo(e.ctx.admin, e.ferreteria.id, { activo: true, slug: "ferre", whatsapp: "" });
    expect(sinNumero.ok).toBe(false);
  });

  it("apagado, con la empresa suspendida o con otro link, no existe", async () => {
    expect(await buscarTienda("tienda-motos")).toBeNull();
    await prenderCatalogo();
    expect((await buscarTienda("tienda-motos"))?.negocioId).toBe(e.motos.id);
    expect((await buscarTienda("tienda-motos"))?.whatsapp).toBe("573001234567");
    await prisma.empresa.update({ where: { id: e.camila.id }, data: { estadoSuscripcion: "SUSPENDIDA" } });
    expect(await buscarTienda("tienda-motos")).toBeNull();
    expect(await buscarTienda("../../etc")).toBeNull();
  });
});

describe("Lo que ve el cliente", () => {
  it("muestra solo lo de esa tienda, con stock, sin costos", async () => {
    await prenderCatalogo();
    const prendaId = await blusa();
    await blusa(e.ferreteria.id); // otra tienda de la misma empresa
    const sinStock = await crearProducto(
      e.ctx.admin,
      e.motos.id,
      esquemaProducto.parse({ codigo: "AGO", nombre: "Agotado", costo: "1000", precioVenta: "2000", stockMinimo: "0", unidad: "UNIDAD", fraccionado: false, porcentajeIva: 0, condicion: "NUEVO" }),
      "0",
    );
    expect(sinStock.ok).toBe(true);
    const tienda = (await buscarTienda("tienda-motos"))!;
    const r = await listarCatalogo(tienda, {});
    expect(r.tarjetas.map((t) => t.clave)).toEqual([prendaId]);
    expect(r.tarjetas[0].tallas).toEqual([
      { talla: "S", disponible: false },
      { talla: "M", disponible: true },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/costo|24000|codigoBarras/);
    expect((await listarCatalogo(tienda, { q: "lina" })).total).toBe(1);
    expect((await listarCatalogo(tienda, { q: "pantalon" })).total).toBe(0);
    expect(await categoriasCatalogo(tienda)).toEqual([]);
  });

  it("no deja ver prendas ni fotos de otra tienda por el link", async () => {
    await prenderCatalogo();
    const ajena = await blusa(e.tiendaOtra.id, e.ctx.adminOtra);
    const tienda = (await buscarTienda("tienda-motos"))!;
    expect(await obtenerTarjeta(tienda, ajena)).toBeNull();
    const productoAjeno = await prisma.producto.findFirstOrThrow({ where: { prendaId: ajena } });
    await prisma.fotoProducto.create({
      data: { productoId: productoAjeno.id, empresaId: e.otra.id, negocioId: e.tiendaOtra.id, tipo: "image/png", datos: Buffer.from([1]) },
    });
    expect(await fotoPublica(tienda, productoAjeno.id)).toBeNull();
    expect(await registrarEvento(tienda, ajena, "vista")).toBe(false);
    expect((await crearAviso(tienda, { clave: ajena, telefono: "3001234567" })).ok).toBe(false);
  });
});

describe("Avísame cuando llegue y qué miran", () => {
  it("guarda el aviso, dice cuándo llegó y sale de la lista al escribirle", async () => {
    await prenderCatalogo();
    const prendaId = await blusa();
    const tienda = (await buscarTienda("tienda-motos"))!;
    expect((await crearAviso(tienda, { clave: prendaId, talla: "S", color: "Negro", cliente: "Laura", telefono: "12" })).ok).toBe(false);
    expect((await crearAviso(tienda, { clave: prendaId, talla: "S", color: "Negro", cliente: "Laura", telefono: "300 111 2233" })).ok).toBe(true);
    // Repetido: no se duplica.
    await crearAviso(tienda, { clave: prendaId, talla: "S", color: "Negro", cliente: "Laura", telefono: "3001112233" });
    let avisos = await avisosPendientes(e.ctx.cajero, e.motos.id, prendaId);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].llego).toBe(false);
    expect(avisos[0].telefono).toBe("573001112233");
    // Otra empresa no los ve.
    await expect(avisosPendientes(e.ctx.adminOtra, e.motos.id)).rejects.toThrow(AccesoDenegado);
    expect((await marcarAvisado(e.ctx.adminOtra, avisos[0].id)).ok).toBe(false);

    const l = await registrarLlegada(e.ctx.admin, prendaId, { tallas: ["S"], colores: ["Negro"], cantidades: { [claveVariante("S", "Negro")]: "2" } });
    expect(l.ok).toBe(true);
    avisos = await avisosPendientes(e.ctx.admin, e.motos.id, prendaId);
    expect(avisos[0].llego).toBe(true);
    expect((await marcarAvisado(e.ctx.cajero, avisos[0].id)).ok).toBe(true);
    expect(await avisosPendientes(e.ctx.admin, e.motos.id)).toHaveLength(0);
  });

  it("cuenta vistas y pedidos por prenda", async () => {
    await prenderCatalogo();
    const prendaId = await blusa();
    const tienda = (await buscarTienda("tienda-motos"))!;
    await registrarEvento(tienda, prendaId, "vista");
    await registrarEvento(tienda, prendaId, "vista");
    await registrarEvento(tienda, prendaId, "pedido");
    const s = await estadisticasCatalogo(e.ctx.admin, e.motos.id);
    expect(s.vistas).toBe(2);
    expect(s.pedidos).toBe(1);
    expect(s.masPedidas[0]).toMatchObject({ clave: prendaId, nombre: "Blusa Lina", vistas: 2, pedidos: 1 });
    await expect(estadisticasCatalogo(e.ctx.adminOtra, e.motos.id)).rejects.toThrow(AccesoDenegado);
  });
});
