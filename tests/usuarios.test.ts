// Usuarios: creación, permisos, protecciones, contraseñas, bloqueo e historial.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { AccesoDenegado } from "@/lib/datos/alcance";
import { MAXIMO_INTENTOS, verificarCredenciales } from "@/lib/datos/autenticacion";
import { prisma } from "@/lib/datos/cliente";
import { cargarContexto } from "@/lib/datos/contexto";
import { listarHistorial, personasDelHistorial } from "@/lib/datos/historial";
import { guardarDatosNegocio } from "@/lib/datos/negocios";
import {
  cambiarEstadoUsuario,
  cambiarMiContrasena,
  crearMiContrasena,
  crearUsuario,
  editarUsuario,
  listarUsuarios,
  restablecerContrasena,
} from "@/lib/datos/usuarios";
import { describirAuditoria } from "@/lib/historial/describir";
import { diaEnBogota } from "@/lib/formato";
import { crearEscenario, type Escenario } from "./escenario";

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterAll(() => prisma.$disconnect());

const hoy = () => diaEnBogota();
const nuevoCajero = (extra: Record<string, unknown> = {}) => ({
  nombre: "Juan Pérez",
  usuario: "Juan.Ferre",
  contrasena: "Tornillo-1234",
  rol: "CAJERO",
  negocios: [e.ferreteria.id],
  ...extra,
});

async function crearYEntrar(extra: Record<string, unknown> = {}) {
  const r = await crearUsuario(e.ctx.admin, nuevoCajero(extra));
  if (!r.ok) throw new Error(r.error);
  const ctx = await cargarContexto(r.id);
  if (!ctx) throw new Error("sin contexto");
  return ctx;
}

describe("crear y editar usuarios", () => {
  it("la administradora crea un cajero de la ferretería con contraseña temporal", async () => {
    const ctx = await crearYEntrar();
    expect(ctx).toMatchObject({ rol: "CAJERO", negociosPermitidos: [e.ferreteria.id], debeCambiarContrasena: true });
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: ctx.usuarioId } });
    expect(u.usuario).toBe("juan.ferre"); // en minúsculas
    expect(u.hashContrasena).not.toContain("Tornillo");
    const login = await verificarCredenciales("JUAN.FERRE", "Tornillo-1234");
    expect(login.ok).toBe(true);
  });

  it("valida los datos y el usuario repetido (en todo el sistema)", async () => {
    const r1 = await crearUsuario(e.ctx.admin, nuevoCajero({ usuario: "juan pérez", contrasena: "corta", negocios: [] }));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(Object.keys(r1.campos ?? {})).toEqual(expect.arrayContaining(["usuario", "contrasena"]));
    // "admin-otra" es de otra empresa: igual está ocupado.
    const r2 = await crearUsuario(e.ctx.admin, nuevoCajero({ usuario: "admin-otra" }));
    expect(r2).toMatchObject({ ok: false, campos: { usuario: expect.any(String) } });
    // Un cajero sin negocio no sirve.
    const r3 = await crearUsuario(e.ctx.admin, nuevoCajero({ negocios: [] }));
    expect(r3).toMatchObject({ ok: false, campos: { negocios: expect.any(String) } });
  });

  it("solo la administradora maneja usuarios", async () => {
    for (const ctx of [e.ctx.socio, e.ctx.cajero]) {
      await expect(crearUsuario(ctx, nuevoCajero())).rejects.toThrow(AccesoDenegado);
      await expect(listarUsuarios(ctx)).rejects.toThrow(AccesoDenegado);
      await expect(
        editarUsuario(ctx, e.ctx.cajero.usuarioId, { nombre: "X", rol: "SOCIO", negocios: [e.motos.id] }),
      ).rejects.toThrow(AccesoDenegado);
      await expect(cambiarEstadoUsuario(ctx, e.ctx.cajero.usuarioId, false)).rejects.toThrow(AccesoDenegado);
      await expect(restablecerContrasena(ctx, e.ctx.cajero.usuarioId, "Nueva-12345")).rejects.toThrow(AccesoDenegado);
    }
  });

  it("no se cruza con otra empresa: ni sus usuarios ni sus negocios", async () => {
    const lista = await listarUsuarios(e.ctx.admin);
    expect(lista.map((u) => u.usuario).sort()).toEqual(["admin", "cajero", "socio"]);
    const r = await editarUsuario(e.ctx.admin, e.ctx.adminOtra.usuarioId, { nombre: "X", rol: "CAJERO", negocios: [e.motos.id] });
    expect(r.ok).toBe(false);
    await expect(crearUsuario(e.ctx.admin, nuevoCajero({ negocios: [e.tiendaOtra.id] }))).rejects.toThrow(AccesoDenegado);
    expect((await cambiarEstadoUsuario(e.ctx.admin, e.ctx.adminOtra.usuarioId, false)).ok).toBe(false);
    expect((await restablecerContrasena(e.ctx.admin, e.ctx.adminOtra.usuarioId, "Nueva-12345")).ok).toBe(false);
  });

  it("cambiar rol y negocios se aplica en la siguiente petición", async () => {
    const r = await editarUsuario(e.ctx.admin, e.ctx.cajero.usuarioId, {
      nombre: "Cajero Ferre",
      rol: "SOCIO",
      negocios: [e.ferreteria.id, e.motos.id],
    });
    expect(r.ok).toBe(true);
    const ctx = await cargarContexto(e.ctx.cajero.usuarioId);
    expect(ctx?.rol).toBe("SOCIO");
    expect([...(ctx?.negociosPermitidos ?? [])].sort()).toEqual([e.ferreteria.id, e.motos.id].sort());
  });

  it("protege a la administradora: no cambia su rol, no se desactiva y siempre queda una", async () => {
    expect(
      (await editarUsuario(e.ctx.admin, e.ctx.admin.usuarioId, { nombre: "Camila", rol: "SOCIO", negocios: [e.motos.id] })).ok,
    ).toBe(false);
    expect((await cambiarEstadoUsuario(e.ctx.admin, e.ctx.admin.usuarioId, false)).ok).toBe(false);
    // Puede cambiarse el nombre.
    expect(
      (await editarUsuario(e.ctx.admin, e.ctx.admin.usuarioId, { nombre: "Camila R.", rol: "ADMINISTRADOR", negocios: [] })).ok,
    ).toBe(true);
    // Con otra administradora, ya se puede degradar a una.
    const r = await crearUsuario(e.ctx.admin, nuevoCajero({ usuario: "laura", rol: "ADMINISTRADOR", negocios: [] }));
    expect(r.ok).toBe(true);
  });
});

describe("desactivar y contraseñas", () => {
  it("desactivar saca a la persona al instante y conserva su historial", async () => {
    expect((await cambiarEstadoUsuario(e.ctx.admin, e.ctx.cajero.usuarioId, false)).ok).toBe(true);
    expect(await cargarContexto(e.ctx.cajero.usuarioId)).toBeNull();
    expect((await verificarCredenciales("cajero", "x")).ok).toBe(false);
    expect(await prisma.usuario.count({ where: { id: e.ctx.cajero.usuarioId } })).toBe(1);
    // Al reactivar, la sesión vieja sigue sin servir: la versión cambió.
    expect((await cambiarEstadoUsuario(e.ctx.admin, e.ctx.cajero.usuarioId, true)).ok).toBe(true);
    const ctx = await cargarContexto(e.ctx.cajero.usuarioId);
    expect(ctx?.versionSesion).toBe(e.ctx.cajero.versionSesion + 1);
  });

  it("después de 5 intentos fallidos queda bloqueado 15 minutos, aunque luego acierte", async () => {
    const ctx = await crearYEntrar();
    const ahora = new Date("2026-10-07T15:00:00Z");
    for (let i = 1; i < MAXIMO_INTENTOS; i++) {
      expect(await verificarCredenciales("juan.ferre", "mala", ahora)).toEqual({ ok: false, motivo: "incorrecto" });
    }
    expect(await verificarCredenciales("juan.ferre", "mala", ahora)).toEqual({ ok: false, motivo: "bloqueado" });
    expect(await verificarCredenciales("juan.ferre", "Tornillo-1234", new Date("2026-10-07T15:10:00Z"))).toEqual({
      ok: false,
      motivo: "bloqueado",
    });
    const despues = await verificarCredenciales("juan.ferre", "Tornillo-1234", new Date("2026-10-07T15:16:00Z"));
    expect(despues.ok).toBe(true);
    const bloqueo = await prisma.auditoria.findFirst({ where: { accion: "BLOQUEO_INGRESO", usuarioId: ctx.usuarioId } });
    expect(bloqueo).not.toBeNull();
    // Un acierto borra los intentos.
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: ctx.usuarioId } })).intentosFallidos).toBe(0);
  });

  it("un usuario que no existe nunca se bloquea ni dice que existe", async () => {
    for (let i = 0; i < 6; i++) expect(await verificarCredenciales("nadie", "x")).toEqual({ ok: false, motivo: "incorrecto" });
  });

  it("restablecer pone contraseña temporal, desbloquea y cierra las sesiones abiertas", async () => {
    const ctx = await crearYEntrar();
    await prisma.usuario.update({
      where: { id: ctx.usuarioId },
      data: { debeCambiarContrasena: false, bloqueadoHasta: new Date(Date.now() + 600_000) },
    });
    expect((await restablecerContrasena(e.ctx.admin, ctx.usuarioId, "corta")).ok).toBe(false);
    expect((await restablecerContrasena(e.ctx.admin, ctx.usuarioId, "Llanta-5678")).ok).toBe(true);
    const despues = await cargarContexto(ctx.usuarioId);
    expect(despues).toMatchObject({ debeCambiarContrasena: true, versionSesion: ctx.versionSesion + 1 });
    expect((await verificarCredenciales("juan.ferre", "Llanta-5678")).ok).toBe(true);
    // Su propia contraseña la cambia en Mi cuenta.
    expect((await restablecerContrasena(e.ctx.admin, e.ctx.admin.usuarioId, "Llanta-5678")).ok).toBe(false);
  });

  it("al entrar con la temporal crea la suya, distinta, y queda normal", async () => {
    const ctx = await crearYEntrar();
    expect((await crearMiContrasena(ctx, { nueva: "Tornillo-1234", repetir: "Tornillo-1234" })).ok).toBe(false);
    expect((await crearMiContrasena(ctx, { nueva: "MiClave-2026", repetir: "otra-cosa" })).ok).toBe(false);
    expect((await crearMiContrasena(ctx, { nueva: "MiClave-2026", repetir: "MiClave-2026" })).ok).toBe(true);
    const ahora = await cargarContexto(ctx.usuarioId);
    expect(ahora?.debeCambiarContrasena).toBe(false);
    expect((await verificarCredenciales("juan.ferre", "MiClave-2026")).ok).toBe(true);
    // Ya no es temporal: no se puede usar ese camino otra vez.
    await expect(crearMiContrasena(ahora!, { nueva: "Otra-12345", repetir: "Otra-12345" })).rejects.toThrow(AccesoDenegado);
  });

  it("Mi cuenta pide la contraseña actual", async () => {
    const ctx = await crearYEntrar();
    expect(
      await cambiarMiContrasena(ctx, { actual: "equivocada", nueva: "MiClave-2026", repetir: "MiClave-2026" }),
    ).toMatchObject({ ok: false, campos: { actual: expect.any(String) } });
    expect((await cambiarMiContrasena(ctx, { actual: "Tornillo-1234", nueva: "MiClave-2026", repetir: "MiClave-2026" })).ok).toBe(
      true,
    );
    expect((await verificarCredenciales("juan.ferre", "Tornillo-1234")).ok).toBe(false);
    expect((await verificarCredenciales("juan.ferre", "MiClave-2026")).ok).toBe(true);
  });
});

describe("historial de cambios", () => {
  it("registra los cambios de usuarios y los cuenta en palabras sencillas", async () => {
    await crearYEntrar();
    const juan = (await listarUsuarios(e.ctx.admin)).find((u) => u.usuario === "juan.ferre")!;
    await editarUsuario(e.ctx.admin, juan.id, { nombre: "Juan Pérez", rol: "CAJERO", negocios: [e.ferreteria.id, e.motos.id] });
    await cambiarEstadoUsuario(e.ctx.admin, juan.id, false);
    const { entradas, total } = await listarHistorial(e.ctx.admin, {
      desde: hoy(),
      hasta: hoy(),
      negocioId: null,
      usuarioId: null,
      grupo: "usuarios",
      pagina: 1,
    });
    expect(total).toBe(3);
    expect(entradas.map((x) => `${x.usuario} ${x.frase}`)).toEqual([
      "admin desactivó a Juan Pérez",
      "admin cambió los permisos de Juan Pérez",
      "admin creó el usuario Juan Pérez (juan.ferre)",
    ]);
    expect(entradas[1].detalle).toBe("negocios: Ferretería → Ferretería, Repuestos de moto");
    expect(entradas[2].detalle).toBe("Cajero · Ferretería");
  });

  it("el socio solo ve el historial de sus negocios, sin los cambios de usuarios", async () => {
    await crearYEntrar();
    await guardarDatosNegocio(e.ctx.socio, e.ferreteria.id, {
      nombre: "Ferretería Camila",
      razonSocial: "",
      nit: "",
      regimen: "",
      direccion: "",
      telefono: "",
      mensajeRecibo: "",
    });
    await guardarDatosNegocio(e.ctx.admin, e.motos.id, {
      nombre: "Motos Camila",
      razonSocial: "",
      nit: "",
      regimen: "",
      direccion: "",
      telefono: "",
      mensajeRecibo: "",
    });
    const filtro = { desde: hoy(), hasta: hoy(), negocioId: null, usuarioId: null, grupo: null, pagina: 1 };
    const socio = await listarHistorial(e.ctx.socio, filtro);
    expect(socio.entradas.map((x) => x.frase)).toEqual(["cambió los datos de Ferretería Camila"]);
    expect(socio.entradas[0].detalle).toBe("Cambió: nombre");
    expect((await personasDelHistorial(e.ctx.socio, filtro)).map((p) => p.nombre)).toEqual(["socio"]);
    await expect(listarHistorial(e.ctx.socio, { ...filtro, negocioId: e.motos.id })).rejects.toThrow(AccesoDenegado);
    await expect(listarHistorial(e.ctx.cajero, filtro)).rejects.toThrow(AccesoDenegado);
    // La administradora ve todo, y otra empresa no ve nada de Camila.
    expect((await listarHistorial(e.ctx.admin, filtro)).total).toBe(3);
    expect((await listarHistorial(e.ctx.adminOtra, filtro)).total).toBe(0);
  });

  it("describe cada tipo de registro sin códigos", () => {
    expect(describirAuditoria("ANULACION_VENTA", { consecutivo: 152, total: 45000, motivo: "se arrepintió" })).toEqual({
      frase: "anuló la venta #152 por $ 45.000",
      detalle: "Motivo: se arrepintió",
    });
    expect(
      describirAuditoria(
        "CAMBIO_PRECIO",
        { codigo: "T14", costo: { antes: 200, despues: 200 }, precioVenta: { antes: 300, despues: 350 } },
        { producto: "Tornillo 1/4" },
      ),
    ).toEqual({ frase: "cambió el precio de Tornillo 1/4 de $ 300 a $ 350", detalle: undefined });
    expect(describirAuditoria("CAMBIO_PRECIO", { antes: 300, despues: 350, motivo: "Factura de compra F-1" }).frase).toBe(
      "cambió el precio de un producto de $ 300 a $ 350",
    );
    expect(
      describirAuditoria("AJUSTE_STOCK", { codigo: "T14", motivo: "CONTEO", antes: "10.5", despues: "8" }, { producto: "Cable" }),
    ).toEqual({
      frase: "ajustó el stock de Cable de 10,5 a 8",
      detalle: "Conteo físico",
    });
    expect(describirAuditoria("BLOQUEO_INGRESO", { intentos: 5, minutos: 15 }).frase).toBe("quedó bloqueado 15 minutos");
    expect(describirAuditoria("ALGO_NUEVO", {}).frase).toBe("algo nuevo");
  });
});
