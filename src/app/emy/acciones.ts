"use server";

import { revalidatePath } from "next/cache";
import {
  agregarLocal,
  cambiarEstadoCliente,
  cambiarLimiteFotos,
  cambiarModulos,
  crearCliente,
  editarCliente,
  registrarPagoCliente,
  restablecerContrasenaCliente,
} from "@/lib/datos/emy";
import { reiniciarDemo } from "@/lib/datos/demo";
import { obtenerSuperadmin } from "@/lib/sesion";

export type EstadoEmy = {
  error?: string;
  campos?: Record<string, string>;
  ok?: boolean;
  /** Se muestra una sola vez: no se guarda en ningún lado sin cifrar. */
  credenciales?: { id: string; usuario: string; contrasena: string };
};

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");

function datosCliente(f: FormData) {
  return {
    nombre: texto(f, "nombre"),
    nit: texto(f, "nit"),
    telefono: texto(f, "telefono"),
    correo: texto(f, "correo"),
    direccion: texto(f, "direccion"),
    mensualidad: texto(f, "mensualidad").replace(/[$.\s]/g, "") || "0",
    proximoPago: texto(f, "proximoPago"),
    notasEmy: texto(f, "notasEmy"),
  };
}

function refrescar(id?: string) {
  revalidatePath("/emy");
  if (id) revalidatePath(`/emy/${id}`);
}

export async function crearClienteAccion(_: EstadoEmy, f: FormData): Promise<EstadoEmy> {
  const ce = await obtenerSuperadmin();
  const nombres = f.getAll("localNombre").map(String);
  const direcciones = f.getAll("localDireccion").map(String);
  const tipos = f.getAll("localTipo").map(String);
  const locales = nombres
    .map((nombre, i) => ({ nombre, direccion: direcciones[i] ?? "", tipo: tipos[i] ?? "" }))
    .filter((l) => l.nombre.trim() || l.direccion.trim() || l.tipo.trim());
  const r = await crearCliente(ce, {
    ...datosCliente(f),
    locales,
    adminNombre: texto(f, "adminNombre"),
    adminUsuario: texto(f, "adminUsuario"),
  });
  if (!r.ok) return { error: r.error, campos: r.campos };
  refrescar();
  return { ok: true, credenciales: { id: r.id, usuario: r.usuario, contrasena: r.contrasena } };
}

export async function editarClienteAccion(_: EstadoEmy, f: FormData): Promise<EstadoEmy> {
  const ce = await obtenerSuperadmin();
  const id = texto(f, "id");
  const r = await editarCliente(ce, id, datosCliente(f));
  if (!r.ok) return { error: r.error, campos: r.campos };
  refrescar(id);
  return { ok: true };
}

export async function cambiarEstadoClienteAccion(id: string, activa: boolean): Promise<EstadoEmy> {
  const ce = await obtenerSuperadmin();
  const r = await cambiarEstadoCliente(ce, String(id), activa === true);
  if (!r.ok) return { error: r.error };
  refrescar(id);
  return { ok: true };
}

export async function registrarPagoAccion(id: string): Promise<EstadoEmy> {
  const ce = await obtenerSuperadmin();
  const r = await registrarPagoCliente(ce, String(id));
  if (!r.ok) return { error: r.error };
  refrescar(id);
  return { ok: true };
}

export async function cambiarModulosAccion(id: string, modulos: string[]): Promise<EstadoEmy> {
  const ce = await obtenerSuperadmin();
  const r = await cambiarModulos(ce, String(id), Array.isArray(modulos) ? modulos.map(String) : []);
  if (!r.ok) return { error: r.error };
  refrescar(id);
  return { ok: true };
}

export async function cambiarLimiteFotosAccion(id: string, limite: string): Promise<EstadoEmy> {
  const ce = await obtenerSuperadmin();
  const r = await cambiarLimiteFotos(ce, String(id), String(limite));
  if (!r.ok) return { error: r.error };
  refrescar(id);
  return { ok: true };
}

export async function agregarLocalAccion(_: EstadoEmy, f: FormData): Promise<EstadoEmy> {
  const ce = await obtenerSuperadmin();
  const id = texto(f, "empresaId");
  const r = await agregarLocal(ce, id, { nombre: texto(f, "nombre"), direccion: texto(f, "direccion"), tipo: texto(f, "tipo") });
  if (!r.ok) return { error: r.error, campos: r.campos };
  refrescar(id);
  return { ok: true };
}

export async function restablecerContrasenaAccion(empresaId: string, usuarioId: string): Promise<EstadoEmy> {
  const ce = await obtenerSuperadmin();
  const r = await restablecerContrasenaCliente(ce, String(empresaId), String(usuarioId));
  if (!r.ok) return { error: r.error };
  refrescar(empresaId);
  return { ok: true, credenciales: { id: r.id, usuario: r.usuario, contrasena: r.contrasena } };
}

export async function reiniciarDemoAccion(): Promise<EstadoEmy> {
  const ce = await obtenerSuperadmin();
  const r = await reiniciarDemo(ce);
  if (!r.ok) return { error: r.error };
  refrescar(r.id);
  return { ok: true };
}
