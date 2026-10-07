"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";

/** Lista desplegable que guarda su valor en la dirección (vacío = todos). Vuelve a la página 1. */
export function SelectorParametro({
  parametro,
  etiqueta,
  todos,
  opciones,
  valor,
}: {
  parametro: string;
  etiqueta: string;
  todos: string;
  opciones: { valor: string; nombre: string }[];
  valor: string;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [cargando, iniciar] = useTransition();
  return (
    <label className="flex flex-col gap-1 text-sm" aria-busy={cargando}>
      <span className="text-muted-foreground">{etiqueta}</span>
      <NativeSelect
        value={valor}
        className="h-10 min-w-44"
        onChange={(e) => {
          const p = new URLSearchParams(parametros.toString());
          if (e.target.value) p.set(parametro, e.target.value);
          else p.delete(parametro);
          p.delete("pagina");
          iniciar(() => router.push(`${ruta}?${p.toString()}`, { scroll: false }));
        }}
      >
        <option value="">{todos}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.nombre}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
