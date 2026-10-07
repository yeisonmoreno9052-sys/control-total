"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type EstadoIngreso = { error?: string; usuario?: string };

export async function ingresar(_: EstadoIngreso, formulario: FormData): Promise<EstadoIngreso> {
  try {
    await signIn("credentials", {
      usuario: formulario.get("usuario"),
      contrasena: formulario.get("contrasena"),
      redirectTo: "/panel",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      // Devolvemos el usuario para no obligar a escribirlo de nuevo.
      const usuario = String(formulario.get("usuario") ?? "").slice(0, 60);
      return { error: "Usuario o contraseña incorrectos.", usuario };
    }
    // signIn termina con una redirección que Next.js maneja lanzando un error.
    throw error;
  }
}
