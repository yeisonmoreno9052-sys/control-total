// La búsqueda no distingue tildes ni mayúsculas: "pantalon nino" encuentra "Pantalón Niño",
// en la caja, en el inventario, en la copia sin internet y después de cambiarle el nombre.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/datos/cliente";
import { buscarParaVenta, buscarProductos, type ProductoCatalogo } from "@/lib/datos/productos";
import { buscarEnCopia } from "@/lib/sin-conexion/buscar";
import { paraBuscar } from "@/lib/texto";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterAll(() => prisma.$disconnect());

const crear = (nombre: string, codigo: string) =>
  prisma.producto.create({
    data: { empresaId: e.camila.id, negocioId: e.motos.id, codigo, nombre, precioVenta: 10000 },
  });

describe("Buscar sin tildes", () => {
  it("la base guarda el nombre sin tildes y lo actualiza al cambiarlo", async () => {
    const p = await crear("Pantalón Niño Algodón", "P1");
    expect((await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).nombreBusqueda).toBe("pantalon nino algodon");
    await prisma.producto.update({ where: { id: p.id }, data: { nombre: "Camión Grúa" } });
    expect((await prisma.producto.findUniqueOrThrow({ where: { id: p.id } })).nombreBusqueda).toBe("camion grua");
  });

  it("encuentra con o sin tildes en la caja y en el inventario", async () => {
    await crear("Pantalón Niño", "P1");
    await crear("Camisa básica", "C1");
    for (const q of ["pantalon nino", "PANTALÓN", "niño"]) {
      const caja = await buscarParaVenta(e.ctx.cajero, e.motos.id, q);
      expect(caja.resultados.map((r) => r.nombre)).toEqual(["Pantalón Niño"]);
    }
    const inv = await buscarProductos(e.ctx.admin, e.motos.id, { q: "basica" });
    expect(inv.productos.map((r) => r.nombre)).toEqual(["Camisa básica"]);
  });

  it("la copia sin internet busca igual", () => {
    const copia = [{ id: "1", codigo: "P1", nombre: "Pantalón Niño", codigoBarras: null, activo: true }] as ProductoCatalogo[];
    expect(buscarEnCopia(copia, "pantalon nino").resultados).toHaveLength(1);
    expect(buscarEnCopia(copia, "Niño").resultados).toHaveLength(1);
    expect(paraBuscar("Pantalón Niño")).toBe("pantalon nino");
  });
});
