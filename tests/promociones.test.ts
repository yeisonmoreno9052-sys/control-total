import { describe, expect, it } from "vitest";
import { aplicarPromociones, descuentoPromo, promoVigente, type PromoCaja } from "@/lib/ventas/promociones";
import { calcularTotales } from "@/lib/ventas/totales";

const veinte: PromoCaja = { nombre: "Black Friday", tipo: "PORCENTAJE", valor: 20, desde: "2026-11-20", hasta: "2026-11-30" };
const fijo: PromoCaja = { nombre: "Jeans a 35", tipo: "PRECIO", valor: 35000, desde: "2026-11-20", hasta: "2026-11-30" };
const linea = (promo: PromoCaja | null, extra: Record<string, unknown> = {}) => ({
  producto: { precioVenta: 45000, promo },
  presentacion: null,
  cantidad: "2",
  descuento: null,
  ...extra,
});

describe("Promociones con fecha", () => {
  it("solo aplica entre las fechas, ambas incluidas", () => {
    expect(promoVigente(veinte, "2026-11-19")).toBe(false);
    expect(promoVigente(veinte, "2026-11-20")).toBe(true);
    expect(promoVigente(veinte, "2026-11-30")).toBe(true);
    expect(promoVigente(veinte, "2026-12-01")).toBe(false);
  });

  it("porcentaje y precio fijo por unidad", () => {
    expect(descuentoPromo(veinte, 45000, "2")).toEqual({ tipo: "porcentaje", valor: 20 });
    expect(descuentoPromo(fijo, 45000, "2")).toEqual({ tipo: "pesos", valor: 20000 });
    expect(descuentoPromo(fijo, 30000, "1")).toBeNull();
  });

  it("se pone sola en la caja, pero un descuento a mano manda y fuera de fecha no aplica", () => {
    const [a] = aplicarPromociones([linea(fijo)], "2026-11-25");
    expect(a).toMatchObject({ promo: "Jeans a 35", descuento: { tipo: "pesos", valor: 20000 } });
    const t = calcularTotales([{ precioUnitario: 45000, cantidad: "2", porcentajeIva: 0, descuento: a.descuento }], null);
    expect(t.total).toBe(70000);
    const [b] = aplicarPromociones([linea(fijo, { descuento: { tipo: "porcentaje", valor: 0 } })], "2026-11-25");
    expect(b.promo).toBeNull();
    const [c] = aplicarPromociones([linea(veinte)], "2026-12-02");
    expect(c).toMatchObject({ promo: null, descuento: null });
  });
});

// --- Capa de datos: crear, aplicar a categorías completas, terminar y permisos ---
import { afterAll as despues, beforeEach as antes } from "vitest";
import { prisma } from "@/lib/datos/cliente";
import { buscarParaVenta } from "@/lib/datos/productos";
import { crearPrenda } from "@/lib/datos/prendas";
import { crearPromocion, listarPromociones, terminarPromocion } from "@/lib/datos/promociones";
import { claveVariante } from "@/lib/inventario/prendas";
import { crearEscenario, type Escenario } from "./escenario";

describe("Promociones guardadas", () => {
  let e: Escenario;
  antes(async () => {
    e = await crearEscenario();
  });
  despues(() => prisma.$disconnect());

  async function prenda(nombre: string, categoriaId?: string) {
    const r = await crearPrenda(e.ctx.admin, e.motos.id, {
      nombre,
      costo: "20.000",
      precioVenta: "50.000",
      porcentajeIva: "0",
      stockMinimo: "0",
      tallas: ["S", "M"],
      colores: [],
      cantidades: { [claveVariante("S", null)]: "2", [claveVariante("M", null)]: "1" },
      ...(categoriaId ? { categoriaId } : {}),
    });
    if (!r.ok) throw new Error(r.error);
    return r;
  }

  const base = { nombre: "Black Friday", tipo: "PORCENTAJE", valor: 20, desde: "2020-01-01", hasta: "2099-12-31" };

  it("pone en promoción varias prendas y una categoría completa de una vez", async () => {
    const cat = await prisma.categoria.create({ data: { empresaId: e.camila.id, negocioId: e.motos.id, nombre: "Jeans" } });
    const a = await prenda("Blusa Lina");
    await prenda("Jean Cello", cat.id);
    await prenda("Jean Skinny", cat.id);
    await prenda("Falda Sin Promo");

    const r = await crearPromocion(e.ctx.admin, e.motos.id, { ...base, prendaIds: [a.prendaId], categoriaIds: [cat.id] });
    if (!r.ok) throw new Error(r.error);
    expect(r.productos).toBe(6); // 3 prendas x 2 tallas

    const lista = await listarPromociones(e.ctx.admin, e.motos.id);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ nombre: "Black Friday", descuento: "20 %", estado: "vigente", productos: 6 });

    const { resultados } = await buscarParaVenta(e.ctx.cajero, e.motos.id, "Jean Cello");
    expect(resultados[0].promo).toMatchObject({ nombre: "Black Friday", tipo: "PORCENTAJE", valor: 20 });
    const falda = await buscarParaVenta(e.ctx.cajero, e.motos.id, "Falda");
    expect(falda.resultados[0].promo ?? null).toBeNull();

    await terminarPromocion(e.ctx.admin, r.id);
    expect((await listarPromociones(e.ctx.admin, e.motos.id))[0].estado).toBe("terminada");
    const despuesDeTerminar = await buscarParaVenta(e.ctx.cajero, e.motos.id, "Jean Cello");
    expect(despuesDeTerminar.resultados[0].promo ?? null).toBeNull();
  });

  it("el cajero no crea promociones y otra empresa no ve las ajenas", async () => {
    const a = await prenda("Blusa Lina");
    const r = await crearPromocion(e.ctx.cajero, e.motos.id, { ...base, prendaIds: [a.prendaId] }).catch((err) => err);
    expect(r?.ok === true).toBe(false);
    const ok = await crearPromocion(e.ctx.admin, e.motos.id, { ...base, prendaIds: [a.prendaId] });
    expect(ok.ok).toBe(true);
    await expect(listarPromociones(e.ctx.adminOtra, e.motos.id)).rejects.toThrow();
    expect(await listarPromociones(e.ctx.adminOtra, e.tiendaOtra.id)).toHaveLength(0);
  });

  it("pide al menos una prenda y fechas en orden", async () => {
    const sinNada = await crearPromocion(e.ctx.admin, e.motos.id, base);
    expect(sinNada.ok).toBe(false);
    const a = await prenda("Blusa Lina");
    const alReves = await crearPromocion(e.ctx.admin, e.motos.id, { ...base, prendaIds: [a.prendaId], desde: "2026-12-10", hasta: "2026-12-01" });
    expect(alReves.ok).toBe(false);
  });
});
