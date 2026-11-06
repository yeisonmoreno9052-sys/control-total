// Pasar varios productos a una categoría de una vez (lo que quedó "sin categoría").
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { asignarCategoria } from "@/lib/datos/categorias";
import { prisma } from "@/lib/datos/cliente";
import { crearProducto } from "@/lib/datos/inventario";
import { buscarProductos, SIN_CATEGORIA } from "@/lib/datos/productos";
import { esquemaProducto } from "@/lib/inventario/esquemas";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

async function crear(negocioId: string, codigo: string) {
  const r = await crearProducto(
    e.ctx.admin,
    negocioId,
    esquemaProducto.parse({
      codigo,
      nombre: `Producto ${codigo}`,
      costo: "100",
      precioVenta: "200",
      stockMinimo: "0",
      unidad: "UNIDAD",
      fraccionado: false,
      porcentajeIva: 0,
      condicion: "NUEVO",
    }),
    "0",
  );
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

describe("cambiar la categoría de varios productos", () => {
  it("los pasa de una vez y el filtro 'sin categoría' los encuentra", async () => {
    const [a, b, c] = [await crear(e.ferreteria.id, "A"), await crear(e.ferreteria.id, "B"), await crear(e.ferreteria.id, "C")];
    const cat = await prisma.categoria.create({ data: { empresaId: e.camila.id, negocioId: e.ferreteria.id, nombre: "Tubería" } });

    const sin = await buscarProductos(e.ctx.socio, e.ferreteria.id, { categoriaId: SIN_CATEGORIA });
    expect(sin.total).toBe(3);

    const r = await asignarCategoria(e.ctx.socio, e.ferreteria.id, [a, b], cat.id);
    expect(r).toMatchObject({ ok: true, cambiados: 2 });
    expect((await buscarProductos(e.ctx.socio, e.ferreteria.id, { categoriaId: SIN_CATEGORIA })).productos.map((p) => p.id)).toEqual([c]);
    expect((await buscarProductos(e.ctx.socio, e.ferreteria.id, { categoriaId: cat.id })).total).toBe(2);

    // Y se pueden devolver a "sin categoría".
    expect(await asignarCategoria(e.ctx.socio, e.ferreteria.id, [a], null)).toMatchObject({ ok: true, cambiados: 1 });
  });

  it("no toca productos ni categorías de otros negocios o empresas", async () => {
    const moto = await crear(e.motos.id, "M");
    const ferre = await crear(e.ferreteria.id, "F");
    const catMotos = await prisma.categoria.create({ data: { empresaId: e.camila.id, negocioId: e.motos.id, nombre: "Llantas" } });
    const catFerre = await prisma.categoria.create({ data: { empresaId: e.camila.id, negocioId: e.ferreteria.id, nombre: "Tubería" } });

    // Un producto de motos colado en la lista de la ferretería no cambia.
    expect(await asignarCategoria(e.ctx.admin, e.ferreteria.id, [ferre, moto], catFerre.id)).toMatchObject({ cambiados: 1 });
    expect((await prisma.producto.findUniqueOrThrow({ where: { id: moto } })).categoriaId).toBeNull();
    // Una categoría de otro negocio no se acepta.
    expect(await asignarCategoria(e.ctx.admin, e.ferreteria.id, [ferre], catMotos.id)).toMatchObject({ ok: false });
    // El socio de la ferretería, el cajero y otra empresa no pueden.
    await expect(asignarCategoria(e.ctx.socio, e.motos.id, [moto], catMotos.id)).rejects.toThrow(AccesoDenegado);
    await expect(asignarCategoria(e.ctx.cajero, e.motos.id, [moto], catMotos.id)).rejects.toThrow();
    await expect(asignarCategoria(e.ctx.adminOtra, e.motos.id, [moto], catMotos.id)).rejects.toThrow(AccesoDenegado);
  });
});
