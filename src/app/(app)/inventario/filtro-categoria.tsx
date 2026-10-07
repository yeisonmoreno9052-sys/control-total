"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";

export function FiltroCategoria({ categorias }: { categorias: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();

  if (categorias.length === 0) return null;

  return (
    <NativeSelect
      aria-label="Filtrar por categoría"
      className="h-12 w-44 md:w-52"
      value={params.get("categoria") ?? ""}
      onChange={(e) => {
        const nuevos = new URLSearchParams(params);
        if (e.target.value) nuevos.set("categoria", e.target.value);
        else nuevos.delete("categoria");
        nuevos.delete("pagina");
        router.replace(`${ruta}?${nuevos.toString()}`, { scroll: false });
      }}
    >
      <option value="">Todas las categorías</option>
      {categorias.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </NativeSelect>
  );
}
