// Campos propios que viajan en la sesión.
import type { DefaultSession } from "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    /** Si no coincide con la del usuario en la base, la sesión ya no sirve. */
    versionSesion?: number;
  }
  interface Session {
    user: { id: string; versionSesion: number } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    versionSesion?: number;
  }
}
