"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Store } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";

/** Un negocio o "Todos los negocios" (solo los que el usuario puede ver). */
export function SelectorNegocioReporte({ opciones, valor }: { opciones: { id: string; nombre: string }[]; valor: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [cargando, iniciar] = useTransition();
  if (opciones.length < 2) return null;
  return (
    <label className="flex items-center gap-2" aria-busy={cargando}>
      <Store className="size-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">Negocio del reporte</span>
      <NativeSelect
        value={valor}
        className="h-10 min-w-48"
        onChange={(e) => {
          const p = new URLSearchParams(parametros.toString());
          p.set("negocio", e.target.value);
          iniciar(() => router.push(`${ruta}?${p.toString()}`, { scroll: false }));
        }}
      >
        <option value="todos">Todos los negocios</option>
        {opciones.map((n) => (
          <option key={n.id} value={n.id}>
            {n.nombre}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
