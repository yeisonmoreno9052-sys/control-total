"use client";

import dynamic from "next/dynamic";

// El carrito se guarda en el navegador: la caja se dibuja allá directamente,
// así arranca con el carrito guardado y no parpadea vacía.
export const CajaCliente = dynamic(() => import("./caja").then((m) => m.Caja), {
  ssr: false,
  loading: () => (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6" aria-busy="true" aria-label="Cargando la caja">
      <div className="h-14 animate-pulse rounded-xl bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  ),
});
