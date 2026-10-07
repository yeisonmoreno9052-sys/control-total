import { Suspense } from "react";
import Link from "next/link";
import { CircleUser, LogOut } from "lucide-react";
import { BotonTema } from "@/components/layout/boton-tema";
import { MenuInferior } from "@/components/layout/menu-inferior";
import { MenuLateral } from "@/components/layout/menu-lateral";
import { SelectorNegocio } from "@/components/layout/selector-negocio";
import { ProveedorConexion } from "@/components/sin-conexion/conexion";
import { FranjaConexion } from "@/components/sin-conexion/franja";
import { Button } from "@/components/ui/button";
import { obtenerEmpresa } from "@/lib/datos/empresa";
import { listarNegocios } from "@/lib/datos/negocios";
import { obtenerContexto } from "@/lib/sesion";
import { salir } from "./acciones";

const NOMBRE_ROL = { ADMINISTRADOR: "Administrador", SOCIO: "Socio", CAJERO: "Cajero", SUPERADMIN: "Superadmin" };

// La sesión se lee en cada petición, así que todo el marco carga dentro de un
// <Suspense>: mientras llega, se ve un esqueleto en lugar de una pantalla en blanco.
export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Cargando />}>
      <Marco>{children}</Marco>
    </Suspense>
  );
}

function Cargando() {
  return (
    <div className="flex min-h-dvh" aria-busy="true" aria-label="Cargando">
      <aside className="hidden w-60 shrink-0 bg-menu md:block" />
      <div className="flex-1">
        <div className="h-16 border-b" />
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 md:px-6">
          <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}

async function Marco({ children }: { children: React.ReactNode }) {
  const ctx = await obtenerContexto();
  const [empresa, negocios] = await Promise.all([obtenerEmpresa(ctx), listarNegocios(ctx)]);

  const logo = empresa?.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={empresa.logoUrl} alt={empresa.nombre} className="size-9 rounded-lg object-contain" />
  ) : (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-destacado-desde to-destacado-hasta font-semibold text-white">
      {empresa?.nombre.charAt(0).toUpperCase()}
    </div>
  );

  return (
    <ProveedorConexion
      negocioId={ctx.negocioActivoId}
      usuario={{ id: ctx.usuarioId, nombre: ctx.nombre }}
      ventas={ctx.modulosActivos.includes("VENTAS")}
    >
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-menu text-menu-foreground md:flex">
          <div className="flex h-16 items-center gap-3 border-b border-menu-borde px-4">
            {logo}
            <span className="truncate font-semibold text-white">{empresa?.nombre}</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <MenuLateral rol={ctx.rol} modulos={ctx.modulosActivos} />
          </div>
          <div className="space-y-1 border-t border-menu-borde p-3">
            <Link href="/mi-cuenta" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5" title="Mi cuenta">
              <p className="truncate font-medium text-white">{ctx.nombre}</p>
              <p>{NOMBRE_ROL[ctx.rol]} · Mi cuenta</p>
            </Link>
            <form action={salir}>
              <Button
                type="submit"
                variant="ghost"
                className="w-full justify-start text-menu-foreground hover:bg-white/5 hover:text-white"
              >
                <LogOut /> Salir
              </Button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
            <div className="md:hidden">{logo}</div>
            <div className="min-w-0 flex-1">
              <SelectorNegocio negocios={negocios} activoId={ctx.negocioActivoId} />
            </div>
            <BotonTema />
            {/* En el celular, Configuración está en "Más" y Salir dentro de Mi cuenta. */}
            <Button asChild variant="ghost" size="icon" className="md:hidden" aria-label="Mi cuenta">
              <Link href="/mi-cuenta">
                <CircleUser className="size-5" />
              </Link>
            </Button>
          </header>
          <FranjaConexion />

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:px-6 md:pb-6">{children}</main>

          <footer className="hidden px-6 pb-4 text-center text-xs text-muted-foreground md:block">
            Desarrollado por EMY TELECOM
          </footer>
        </div>

        <MenuInferior rol={ctx.rol} modulos={ctx.modulosActivos} />
      </div>
    </ProveedorConexion>
  );
}
