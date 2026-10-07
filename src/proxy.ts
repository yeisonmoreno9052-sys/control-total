import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

// Revisión rápida en cada petición: sin sesión, a /ingresar.
// La verificación de verdad (usuario activo, empresa, negocios) se hace en el
// servidor con obtenerContexto(), no aquí.
const { auth } = NextAuth(authConfig);

export const proxy = auth((req) => {
  const conSesion = !!req.auth;
  const enIngreso = req.nextUrl.pathname.startsWith("/ingresar");

  if (!conSesion && !enIngreso) {
    return NextResponse.redirect(new URL("/ingresar", req.nextUrl));
  }
  if (conSesion && enIngreso) {
    return NextResponse.redirect(new URL("/panel", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
