// Prendas con tallas y colores: crear la prenda con todas sus combinaciones, códigos,
// stock por movimientos, agregar tallas, cambiar precio, vender y aislamiento.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { abrirCaja } from "@/lib/datos/caja";
import { prisma } from "@/lib/datos/cliente";
import { guardarPreferenciasVenta, obtenerPreferenciasVenta } from "@/lib/datos/negocios";
import { agregarVariantes, cambiarPrecioPrenda, crearPrenda, obtenerPrenda } from "@/lib/datos/prendas";
import { buscarParaVenta } from "@/lib/datos/productos";
import { registrarVenta } from "@/lib/datos/ventas";
import {
  abreviarColor,
  claveVariante,
  codigosVariantes,
  combinaciones,
  esquemaPrenda,
  nombreVariante,
  sinRepetidas,
} from "@/lib/inventario/prendas";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterAll(() => prisma.$disconnect());

const blusa = (datos: Record<string, unknown> = {}) => ({
  nombre: "Blusa Lina",
  costo: "24.000",
  precioVenta: "45.000",
  porcentajeIva: "0",
  stockMinimo: "1",
  tallas: ["S", "M", "L"],
  colores: ["Negro", "Blanco"],
  cantidades: { [claveVariante("M", "Negro")]: "3", [claveVariante("S", "Blanco")]: "2" },
  ...datos,
});

async function crear(datos: Record<string, unknown> = {}, negocioId = e.motos.id, ctx = e.ctx.admin) {
  const r = await crearPrenda(ctx, negocioId, blusa(datos));
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("Ayudas de tallas y colores", () => {
  it("arma nombres, combinaciones y quita repetidas sin importar tildes ni mayúsculas", () => {
    expect(nombreVariante("Blusa Lina", "M", "Negro")).toBe("Blusa Lina - M - Negro");
    expect(nombreVariante("Gorra", "Única", null)).toBe("Gorra - Única");
    expect(combinaciones(["S", "M"], ["Negro", "Rojo"])).toHaveLength(4);
    expect(combinaciones(["S", "M"], [])).toEqual([
      { talla: "S", color: null },
      { talla: "M", color: null },
    ]);
    expect(sinRepetidas([" azul  claro", "Azul Claro", "Rosa", "rosa", ""])).toEqual(["Azul claro", "Rosa"]);
  });

  it("los códigos son cortos, sin tildes y no se repiten", () => {
    expect(abreviarColor("Azul claro")).toBe("AZC");
    expect(abreviarColor("Café")).toBe("CAF");
    const codigo = codigosVariantes("PR-0001", ["M", "Única"], ["Azul", "Azulado"]);
    expect(codigo("M", "Azul")).toBe("PR-0001-M-AZU");
    expect(codigo("M", "Azulado")).toBe("PR-0001-M-AZU2");
    expect(codigo("Única", null)).toBe("PR-0001-U");
  });

  it("valida el formulario", () => {
    const r = esquemaPrenda.safeParse(blusa({ tallas: [], precioVenta: "0" }));
    expect(r.success).toBe(false);
    const campos = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    expect(campos).toContain("tallas");
    expect(campos).toContain("precioVenta");
  });
});

describe("Configuración", () => {
  it("vender por tallas se activa por negocio y viene apagado", async () => {
    expect((await obtenerPreferenciasVenta(e.ctx.admin, e.motos.id)).usaTallas).toBe(false);
    await guardarPreferenciasVenta(e.ctx.admin, e.motos.id, { ivaPorDefecto: "0", botonesRapidos: false, usaTallas: true });
    expect((await obtenerPreferenciasVenta(e.ctx.admin, e.motos.id)).usaTallas).toBe(true);
    expect((await obtenerPreferenciasVenta(e.ctx.admin, e.ferreteria.id)).usaTallas).toBe(false);
  });
});

describe("Nueva prenda", () => {
  it("crea un producto por talla y color, con código propio y el stock por movimientos", async () => {
    const r = await crear();
    const productos = await prisma.producto.findMany({ where: { prendaId: r.prendaId }, orderBy: { codigo: "asc" } });
    expect(productos).toHaveLength(6);
    expect(productos.map((p) => p.codigo)).toContain("PR-0001-M-NEG");
    const mNegro = productos.find((p) => p.codigo === "PR-0001-M-NEG")!;
    expect(mNegro).toMatchObject({
      nombre: "Blusa Lina - M - Negro",
      prenda: "Blusa Lina",
      talla: "M",
      color: "Negro",
      costo: 24000,
      precioVenta: 45000,
      unidad: "UNIDAD",
      negocioId: e.motos.id,
      empresaId: e.camila.id,
    });
    expect(mNegro.stock.toString()).toBe("3");
    const movs = await prisma.movimientoInventario.findMany({ where: { productoId: mNegro.id } });
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ tipo: "CREACION" });
    expect(movs[0].cantidad.toString()).toBe("3");
    // Las que quedaron en 0 no dejan movimiento.
    const lNegro = productos.find((p) => p.codigo === "PR-0001-L-NEG")!;
    expect(await prisma.movimientoInventario.count({ where: { productoId: lNegro.id } })).toBe(0);
  });

  it("numera las prendas seguido por negocio", async () => {
    await crear();
    const otra = await crear({ nombre: "Jean tiro alto", tallas: ["8"], colores: ["Azul"], cantidades: {} });
    const p = await prisma.producto.findFirstOrThrow({ where: { prendaId: otra.prendaId } });
    expect(p.codigo).toBe("PR-0002-8-AZU");
    const enFerreteria = await crear({ tallas: ["S"], colores: [] }, e.ferreteria.id);
    const f = await prisma.producto.findFirstOrThrow({ where: { prendaId: enFerreteria.prendaId } });
    expect(f.codigo).toBe("PR-0001-S");
  });

  it("el cajero sin permiso no crea prendas, y nadie crea en un negocio ajeno", async () => {
    await expect(crearPrenda(e.ctx.cajero, e.motos.id, blusa())).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(crearPrenda(e.ctx.socio, e.motos.id, blusa())).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(crearPrenda(e.ctx.adminOtra, e.motos.id, blusa())).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe("Prenda existente", () => {
  it("muestra sus tallas y colores, y otra empresa no la ve", async () => {
    const r = await crear();
    const prenda = await obtenerPrenda(e.ctx.admin, r.prendaId);
    expect(prenda).toMatchObject({ nombre: "Blusa Lina", tallas: ["S", "M", "L"], colores: ["Negro", "Blanco"], unidades: 5 });
    expect(await obtenerPrenda(e.ctx.adminOtra, r.prendaId)).toBeNull();
    expect(await obtenerPrenda(e.ctx.socio, r.prendaId)).toBeNull();
  });

  it("agrega una talla nueva para todos los colores, con el mismo precio", async () => {
    const r = await crear();
    const a = await agregarVariantes(e.ctx.admin, r.prendaId, {
      tallas: ["XL"],
      colores: [],
      cantidades: { [claveVariante("XL", "Negro")]: "4" },
    });
    expect(a).toMatchObject({ ok: true, creadas: 2 });
    const xl = await prisma.producto.findFirstOrThrow({ where: { prendaId: r.prendaId, talla: "XL", color: "Negro" } });
    expect(xl).toMatchObject({ codigo: "PR-0001-XL-NEG", precioVenta: 45000, costo: 24000 });
    expect(xl.stock.toString()).toBe("4");
    const repetida = await agregarVariantes(e.ctx.admin, r.prendaId, { tallas: ["m"], colores: ["negro"] });
    expect(repetida.ok).toBe(false);
  });

  it("cambia el precio de todas las tallas y deja auditoría", async () => {
    const r = await crear();
    expect((await cambiarPrecioPrenda(e.ctx.admin, r.prendaId, 49900)).ok).toBe(true);
    const precios = await prisma.producto.findMany({ where: { prendaId: r.prendaId }, select: { precioVenta: true } });
    expect(new Set(precios.map((p) => p.precioVenta))).toEqual(new Set([49900]));
    expect(await prisma.auditoria.count({ where: { accion: "CAMBIO_PRECIO" } })).toBe(6);
    await expect(cambiarPrecioPrenda(e.ctx.cajero, r.prendaId, 1000)).rejects.toBeInstanceOf(AccesoDenegado);
  });
});

describe("Caja", () => {
  it("al buscar por nombre trae todas las tallas y colores de la prenda", async () => {
    await crear();
    const r = await buscarParaVenta(e.ctx.cajero, e.motos.id, "blusa");
    expect(r.resultados).toHaveLength(6);
    expect(r.resultados[0]).toMatchObject({ prenda: "Blusa Lina" });
    expect(r.resultados.every((p) => p.prendaId)).toBe(true);
  });

  it("al escanear la etiqueta entra la talla y el color exactos, y la venta descuenta su stock", async () => {
    await crear();
    const r = await buscarParaVenta(e.ctx.cajero, e.motos.id, "PR-0001-M-NEG");
    expect(r.exacto).toMatchObject({ nombre: "Blusa Lina - M - Negro", talla: "M", color: "Negro" });
    await abrirCaja(e.ctx.cajero, e.motos.id, 0);
    const v = await registrarVenta(e.ctx.cajero, e.motos.id, {
      lineas: [{ productoId: r.exacto!.id, cantidad: "1" }],
      totalEsperado: 45000,
      pago: { forma: "efectivo", recibido: 50000 },
    });
    expect(v.ok).toBe(true);
    const p = await prisma.producto.findUniqueOrThrow({ where: { id: r.exacto!.id } });
    expect(p.stock.toString()).toBe("2");
  });
});
