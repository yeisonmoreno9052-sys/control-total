"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { COOKIE_NEGOCIO, obtenerContexto } from "@/lib/sesion";

export async function salir() {
  (await cookies()).delete(COOKIE_NEGOCIO);
  await signOut({ redirectTo: "/ingresar" });
}

export async function cambiarNegocio(negocioId: string) {
  const id = z.string().min(1).max(40).parse(negocioId);
  const ctx = await obtenerContexto();
  if (!ctx.negociosPermitidos.includes(id)) {
    return { error: "No tienes acceso a ese negocio." };
  }
  (await cookies()).set(COOKIE_NEGOCIO, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return {};
}
