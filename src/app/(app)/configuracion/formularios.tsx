"use client";

import { useActionState, useEffect, useState } from "react";
import { ImageUp } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { DatosNegocio, PreferenciasVenta } from "@/lib/datos/negocios";
import { IVAS } from "@/lib/inventario/unidades";
import { guardarLogoAccion, guardarNegocioAccion, guardarPreferenciasVentaAccion, type EstadoConfig } from "./acciones";

function Guardado({ ok }: { ok?: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ok) return;
    const mostrar = setTimeout(() => setVisible(true), 0);
    const ocultar = setTimeout(() => setVisible(false), 3000);
    return () => {
      clearTimeout(mostrar);
      clearTimeout(ocultar);
    };
  }, [ok]);
  return visible ? (
    <span role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
      Guardado
    </span>
  ) : null;
}

export function FormularioNegocio({ negocio }: { negocio: DatosNegocio }) {
  const [estado, accion, guardando] = useActionState<EstadoConfig, FormData>(guardarNegocioAccion, {});
  const e = estado.campos ?? {};
  const campo = (id: keyof DatosNegocio, etiqueta: string, ayuda?: string, max = 200) => (
    <Campo id={id} etiqueta={etiqueta} error={e[id]} ayuda={ayuda}>
      <Input id={id} name={id} defaultValue={negocio[id] ?? ""} maxLength={max} />
    </Campo>
  );
  return (
    <form action={accion} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {campo("nombre", "Nombre del negocio", "Así aparece en el menú y en el recibo.", 100)}
        {campo("razonSocial", "Razón social (opcional)", undefined, 150)}
        {campo("nit", "NIT (opcional)", undefined, 30)}
        {campo("regimen", "Régimen (opcional)", "Ej.: No responsable de IVA", 80)}
        {campo("direccion", "Dirección (opcional)")}
        {campo("telefono", "Teléfono (opcional)", undefined, 40)}
      </div>
      {campo("mensajeRecibo", "Mensaje al pie del recibo (opcional)", "Ej.: ¡Gracias por su compra! Cambios dentro de los 8 días.")}
      <AvisoError mensaje={estado.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar datos"}
        </Button>
        <Guardado ok={estado.ok} />
      </div>
    </form>
  );
}

export function FormularioPreferenciasVenta({ preferencias }: { preferencias: PreferenciasVenta }) {
  const [estado, accion, guardando] = useActionState<EstadoConfig, FormData>(guardarPreferenciasVentaAccion, {});
  const e = estado.campos ?? {};
  return (
    <form action={accion} className="space-y-4">
      <Campo
        id="ivaPorDefecto"
        etiqueta="IVA de los productos nuevos"
        error={e.ivaPorDefecto}
        ayuda="Si el negocio no cobra IVA, déjalo en 0 %. Los productos que ya existen no cambian."
        className="max-w-xs"
      >
        <NativeSelect id="ivaPorDefecto" name="ivaPorDefecto" defaultValue={String(preferencias.ivaPorDefecto)}>
          {IVAS.map((v) => (
            <option key={v} value={v}>
              {v} %
            </option>
          ))}
        </NativeSelect>
      </Campo>
      <label className="flex items-start gap-3 rounded-lg border p-3">
        <input
          type="checkbox"
          name="botonesRapidos"
          defaultChecked={preferencias.botonesRapidos}
          className="mt-0.5 size-5 accent-[var(--primary)]"
        />
        <span>
          <span className="font-medium">Usar botones rápidos en la caja</span>
          <span className="block text-sm text-muted-foreground">
            Para cafeterías y negocios sin código de barras: los productos que marques como &quot;botón rápido&quot; salen
            en la caja como cuadros grandes para tocar.
          </span>
        </span>
      </label>
      <AvisoError mensaje={estado.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        <Guardado ok={estado.ok} />
      </div>
    </form>
  );
}

export function FormularioLogo({ logoUrl }: { logoUrl: string | null }) {
  const [estado, accion, guardando] = useActionState<EstadoConfig, FormData>(guardarLogoAccion, {});
  const [vista, setVista] = useState<string | null>(null);
  return (
    <form action={accion} className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white">
          {vista || logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vista ?? logoUrl!} alt="Logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageUp className="size-8 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <Input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Elegir logo"
            onChange={(ev) => {
              const archivo = ev.target.files?.[0];
              setVista(archivo ? URL.createObjectURL(archivo) : null);
            }}
            className="h-auto py-2"
          />
          <p className="text-sm text-muted-foreground">PNG, JPG o WEBP de máximo 300 KB. Sale en el menú y en los recibos.</p>
        </div>
      </div>
      <AvisoError mensaje={estado.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={guardando || !vista}>
          {guardando ? "Subiendo…" : "Guardar logo"}
        </Button>
        {logoUrl && (
          <Button type="submit" name="quitar" value="1" variant="ghost" disabled={guardando}>
            Quitar logo
          </Button>
        )}
        <Guardado ok={estado.ok} />
      </div>
    </form>
  );
}
