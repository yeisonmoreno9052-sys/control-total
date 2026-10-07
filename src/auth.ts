import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { verificarCredenciales } from "@/lib/datos/autenticacion";

const esquemaIngreso = z.object({
  usuario: z.string().trim().min(1).max(60),
  contrasena: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  logger: {
    // Un intento de ingreso fallido es normal; no lo registramos como error.
    error(error) {
      if ((error as { type?: string }).type !== "CredentialsSignin") console.error(error);
    },
  },
  providers: [
    Credentials({
      credentials: { usuario: {}, contrasena: {} },
      async authorize(credenciales) {
        const datos = esquemaIngreso.safeParse(credenciales);
        if (!datos.success) return null;
        const usuario = await verificarCredenciales(datos.data.usuario, datos.data.contrasena);
        return usuario ? { id: usuario.id, name: usuario.nombre } : null;
      },
    }),
  ],
});
