"use client";

import dynamic from "next/dynamic";

// El borrador de la factura se guarda en el navegador (una factura de 40 líneas no se
// debe perder por cerrar la pestaña), así que el formulario se dibuja allá directamente.
export const FacturaCliente = dynamic(() => import("./formulario-factura").then((m) => m.FormularioFactura), {
  ssr: false,
  loading: () => (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando la factura">
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  ),
});
