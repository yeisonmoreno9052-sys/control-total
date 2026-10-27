// Fotos de productos: quién las pone, quién las ve y que no se crucen entre empresas ni negocios.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/datos/cliente";
import { guardarFotoProducto, obtenerFotoProducto } from "@/lib/datos/fotos-producto";
import { crearProducto } from "@/lib/datos/inventario";
import { guardarPreferenciasVenta } from "@/lib/datos/negocios";
import { botonesRapidos, catalogoCaja, obtenerProducto } from "@/lib/datos/productos";
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
});
