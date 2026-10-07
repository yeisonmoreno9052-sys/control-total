// CLAUDE.md §8: listas y búsqueda fluidas con 40.000 productos.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/datos/cliente";
import { buscarProductos, contarStockBajo } from "@/lib/datos/productos";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeAll(async () => {
  e = await crearEscenario();
  // 40.000 productos en un solo INSERT (mucho más rápido que uno por uno).
  await prisma.$executeRaw`
    INSERT INTO "Producto" ("id", "empresaId", "negocioId", "codigo", "codigoBarras", "nombre", "costo", "precioVenta", "stock", "stockMinimo", "actualizadoEn")
    SELECT 'p' || g, ${e.camila.id}, ${e.ferreteria.id}, 'COD-' || g, '770' || lpad(g::text, 10, '0'),
           (ARRAY['Tornillo', 'Tuerca', 'Arandela', 'Puntilla', 'Cable', 'Tubo', 'Codo', 'Llave'])[1 + g % 8]
             || ' ' || (ARRAY['1/4', '3/8', '1/2', '5/16', '#12', '#14'])[1 + g % 6] || ' x ' || (g % 50) || ' ref ' || g,
           100 + g % 1000, 200 + g % 2000, g % 30, 10, now()
    FROM generate_series(1, 40000) AS g`;
  await prisma.$executeRaw`ANALYZE "Producto"`;
}, 120_000);

afterAll(() => prisma.$disconnect());

async function medir<T>(fn: () => Promise<T>) {
  await fn(); // la primera vez calienta conexiones
  const inicio = performance.now();
  const resultado = await fn();
  return { resultado, ms: performance.now() - inicio };
}

describe("rendimiento con 40.000 productos", () => {
  it("la primera página de la lista carga rápido", async () => {
    const { resultado, ms } = await medir(() => buscarProductos(e.ctx.admin, e.ferreteria.id, {}));
    expect(resultado.total).toBe(40000);
    expect(resultado.productos).toHaveLength(50);
    expect(ms).toBeLessThan(500);
  });

  it("buscar por partes del nombre responde rápido", async () => {
    const { resultado, ms } = await medir(() => buscarProductos(e.ctx.admin, e.ferreteria.id, { q: "tornillo 1/4" }));
    expect(resultado.total).toBeGreaterThan(0);
    expect(resultado.productos.every((p) => /tornillo/i.test(p.nombre) && p.nombre.includes("1/4"))).toBe(true);
    expect(ms).toBeLessThan(500);
  });

  it("escanear un código de barras responde rápido", async () => {
    const { resultado, ms } = await medir(() => buscarProductos(e.ctx.admin, e.ferreteria.id, { q: "7700000031416" }));
    expect(resultado.productos.map((p) => p.codigo)).toEqual(["COD-31416"]);
    expect(ms).toBeLessThan(500);
  });

  it("contar el stock bajo responde rápido", async () => {
    const { resultado, ms } = await medir(() => contarStockBajo(e.ctx.admin, e.ferreteria.id));
    expect(resultado).toBeGreaterThan(0);
    expect(ms).toBeLessThan(500);
  });
});
