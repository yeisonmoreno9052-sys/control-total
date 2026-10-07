// Principio 3 de CLAUDE.md: los datos de una empresa jamás se cruzan con los de otra.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado, datosDe } from "@/lib/datos/alcance";
import { prisma } from "@/lib/datos/cliente";
import { listarNegocios, obtenerNegocio } from "@/lib/datos/negocios";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;

beforeEach(async () => {
  e = await crearEscenario();
});

afterAll(() => prisma.$disconnect());

describe("aislamiento entre empresas", () => {
  it("un usuario solo lista los negocios de su empresa", async () => {
    const negocios = await listarNegocios(e.ctx.adminOtra);
    expect(negocios.map((n) => n.nombre)).toEqual(["Tienda de otra"]);
  });

  it("no puede leer un negocio de otra empresa aunque conozca su id", async () => {
    expect(await obtenerNegocio(e.ctx.adminOtra, e.motos.id)).toBeNull();
    expect(await obtenerNegocio(e.ctx.admin, e.tiendaOtra.id)).toBeNull();
    expect(await datosDe(e.ctx.adminOtra).negocio.findUnique({ where: { id: e.motos.id } })).toBeNull();
  });

  it("no puede leer los datos de otra empresa", async () => {
    expect((await obtenerEmpresa(e.ctx.adminOtra))?.nombre).toBe("Otra Empresa");
    const empresa = await datosDe(e.ctx.adminOtra).empresa.findUnique({ where: { id: e.camila.id } });
    expect(empresa).toBeNull();
  });

  it("no puede ver los usuarios de otra empresa", async () => {
    const usuarios = await datosDe(e.ctx.adminOtra).usuario.findMany({ select: { usuario: true } });
    expect(usuarios.map((u) => u.usuario)).toEqual(["admin-otra"]);
    const conteo = await datosDe(e.ctx.adminOtra).usuario.count({ where: { usuario: "admin" } });
    expect(conteo).toBe(0);
  });

  it("no puede editar ni borrar registros de otra empresa", async () => {
    const datos = datosDe(e.ctx.adminOtra);
    await expect(
      datos.negocio.update({ where: { id: e.motos.id }, data: { nombre: "Hackeado" } }),
    ).rejects.toThrow();
    const editados = await datos.negocio.updateMany({ data: { nombre: "Hackeado" }, where: { nombre: "Ferretería" } });
    expect(editados.count).toBe(0);
    const borrados = await datos.usuarioNegocio.deleteMany({});
    expect(borrados.count).toBe(0);

    const motos = await prisma.negocio.findUnique({ where: { id: e.motos.id } });
    expect(motos?.nombre).toBe("Repuestos de moto");
    expect(await prisma.usuarioNegocio.count({ where: { empresaId: e.camila.id } })).toBe(2);
  });

  it("al crear, el registro queda siempre en la empresa del usuario", async () => {
    const creado = await datosDe(e.ctx.adminOtra).negocio.create({
      data: { nombre: "Intento", empresaId: e.camila.id },
    });
    expect(creado.empresaId).toBe(e.otra.id);
  });

  it("no puede mover un registro a otra empresa", async () => {
    await datosDe(e.ctx.adminOtra).negocio.update({
      where: { id: e.tiendaOtra.id },
      data: { empresaId: e.camila.id },
    });
    const tienda = await prisma.negocio.findUnique({ where: { id: e.tiendaOtra.id } });
    expect(tienda?.empresaId).toBe(e.otra.id);
  });

  it("no permite traer relaciones con include, que se saltarían el filtro", async () => {
    await expect(
      datosDe(e.ctx.socio).empresa.findFirst({ include: { negocios: true } }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
    await expect(
      datosDe(e.ctx.socio).empresa.findFirst({ select: { negocios: true } }),
    ).rejects.toBeInstanceOf(AccesoDenegado);
  });

  it("sin empresa en la sesión no hay acceso", () => {
    expect(() => datosDe({ ...e.ctx.admin, empresaId: "" })).toThrow(AccesoDenegado);
  });
});
