// Un socio o cajero solo ve los negocios que tiene asignados.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado, datosDe } from "@/lib/datos/alcance";
import { prisma } from "@/lib/datos/cliente";
import { cargarContexto } from "@/lib/datos/contexto";
import { listarNegocios, obtenerNegocio } from "@/lib/datos/negocios";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

describe("aislamiento entre negocios", () => {
  it("la administradora ve los dos negocios", async () => {
    const negocios = await listarNegocios(e.ctx.admin);
    expect(negocios.map((n) => n.nombre)).toEqual(["Ferretería", "Repuestos de moto"]);
  });

  it("el socio de la ferretería no ve el negocio de motos", async () => {
    const negocios = await listarNegocios(e.ctx.socio);
    expect(negocios.map((n) => n.nombre)).toEqual(["Ferretería"]);
    expect(await obtenerNegocio(e.ctx.socio, e.motos.id)).toBeNull();
  });

  it("el cajero de motos no ve la ferretería", async () => {
    const negocios = await listarNegocios(e.ctx.cajero);
    expect(negocios.map((n) => n.nombre)).toEqual(["Repuestos de moto"]);
    expect(await obtenerNegocio(e.ctx.cajero, e.ferreteria.id)).toBeNull();
  });

  it("el socio no ve las asignaciones del negocio de motos", async () => {
    const asignaciones = await datosDe(e.ctx.socio).usuarioNegocio.findMany();
    expect(asignaciones.every((a) => a.negocioId === e.ferreteria.id)).toBe(true);
  });

  it("el socio no puede darse acceso a un negocio que no tiene", async () => {
    await expect(
      datosDe(e.ctx.socio).usuarioNegocio.create({
        data: { usuarioId: e.ctx.socio.usuarioId, negocioId: e.motos.id, empresaId: e.camila.id },
      }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("un negocio desactivado deja de aparecer", async () => {
    await prisma.negocio.update({ where: { id: e.ferreteria.id }, data: { activo: false } });
    const socio = await cargarContexto(e.ctx.socio.usuarioId);
    expect(socio?.negociosPermitidos).toEqual([]);
    const admin = await cargarContexto(e.ctx.admin.usuarioId);
    expect(admin?.negociosPermitidos).toEqual([e.motos.id]);
  });

  it("un usuario desactivado o de una empresa suspendida no tiene sesión", async () => {
    await prisma.usuario.update({ where: { id: e.ctx.cajero.usuarioId }, data: { activo: false } });
    expect(await cargarContexto(e.ctx.cajero.usuarioId)).toBeNull();

    await prisma.empresa.update({ where: { id: e.camila.id }, data: { estadoSuscripcion: "SUSPENDIDA" } });
    expect(await cargarContexto(e.ctx.admin.usuarioId)).toBeNull();
  });
});
