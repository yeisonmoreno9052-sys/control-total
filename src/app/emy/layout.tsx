import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { salir } from "@/app/(app)/acciones";
import { BotonTema } from "@/components/layout/boton-tema";
import { Button } from "@/components/ui/button";
import { obtenerSuperadmin } from "@/lib/sesion";

export const metadata: Metadata = { title: "Panel EMY · Control Total" };

// Panel interno de EMY TELECOM. Solo entra el superadmin (obtenerSuperadmin manda a
// cualquier otro usuario a su propio inicio).
export default function LayoutEmy({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense fallback={<header className="h-16 bg-menu" />}>
        <Encabezado />
      </Suspense>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-muted" aria-busy="true" />}>{children}</Suspense>
      </main>
      <footer className="px-6 pb-4 text-center text-xs text-muted-foreground">Panel interno de EMY TELECOM</footer>
    </div>
  );
}

async function Encabezado() {
  const ce = await obtenerSuperadmin();
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 bg-menu px-4 text-white md:px-6 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
      <Link href="/emy" className="flex min-w-0 flex-1 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/iconos/icono.svg" alt="" className="size-9 rounded-lg" />
        <span className="min-w-0">
          <span className="block truncate font-semibold">Control Total</span>
          <span className="block truncate text-xs text-white/70">Panel de EMY TELECOM</span>
        </span>
      </Link>
      <BotonTema />
      <form action={salir}>
        <Button type="submit" variant="ghost" className="text-white">
          <LogOut /> <span className="max-sm:sr-only">Salir</span>
        </Button>
      </form>
    </header>
  );
}
