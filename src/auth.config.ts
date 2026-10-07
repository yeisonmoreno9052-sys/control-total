import type { NextAuthConfig } from "next-auth";

// Configuración liviana (sin base de datos) que también usa proxy.ts.
export const authConfig = {
  pages: { signIn: "/ingresar" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.versionSesion = user.versionSesion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.versionSesion = typeof token.versionSesion === "number" ? token.versionSesion : 0;
      return session;
    },
  },
} satisfies NextAuthConfig;
