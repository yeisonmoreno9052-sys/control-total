"use client";

import { useActionState } from "react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProveedorVista } from "@/lib/datos/compras";
import { guardarProveedorAccion, type EstadoAccion } from "../acciones";

export function FormularioProveedor({ proveedor }: { proveedor?: ProveedorVista }) {
  const [estado, accion, guardando] = useActionState<EstadoAccion, FormData>(guardarProveedorAccion, {});
  const e = estado.campos ?? {};
  return (
    <form action={accion} className="max-w-xl space-y-5">
      {proveedor && <input type="hidden" name="id" value={proveedor.id} />}
      <Campo id="nombre" etiqueta="Nombre o razón social" error={e.nombre}>
        <Input id="nombre" name="nombre" defaultValue={proveedor?.nombre} required maxLength={150} autoFocus />
      </Campo>
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo id="nit" etiqueta="NIT (opcional)" error={e.nit}>
          <Input id="nit" name="nit" defaultValue={proveedor?.nit ?? ""} maxLength={30} placeholder="900123456-7" />
        </Campo>
        <Campo id="telefono" etiqueta="Teléfono (opcional)" error={e.telefono}>
          <Input id="telefono" name="telefono" type="tel" defaultValue={proveedor?.telefono ?? ""} maxLength={40} />
        </Campo>
        <Campo id="contacto" etiqueta="Persona de contacto (opcional)" error={e.contacto}>
          <Input id="contacto" name="contacto" defaultValue={proveedor?.contacto ?? ""} maxLength={100} />
        </Campo>
        <Campo id="correo" etiqueta="Correo (opcional)" error={e.correo}>
          <Input id="correo" name="correo" type="email" defaultValue={proveedor?.correo ?? ""} maxLength={150} />
        </Campo>
      </div>
      <Campo id="notas" etiqueta="Notas (opcional)" error={e.notas} ayuda="Ej.: días de visita, cuenta para transferir.">
        <Textarea id="notas" name="notas" defaultValue={proveedor?.notas ?? ""} maxLength={500} />
      </Campo>
      <AvisoError mensaje={estado.error} />
      <Button type="submit" size="lg" disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar proveedor"}
      </Button>
    </form>
  );
}
