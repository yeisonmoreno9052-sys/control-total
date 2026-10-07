"use client";

import { useTransition } from "react";
import { Store } from "lucide-react";
import { cambiarNegocio } from "@/app/(app)/acciones";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Negocio = { id: string; nombre: string };

export function SelectorNegocio({ negocios, activoId }: { negocios: Negocio[]; activoId: string | null }) {
  const [cambiando, iniciar] = useTransition();

  if (negocios.length === 0) return null;

  if (negocios.length === 1) {
    return (
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Store className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{negocios[0].nombre}</span>
      </span>
    );
  }

  return (
    <Select
      value={activoId ?? undefined}
      disabled={cambiando}
      onValueChange={(id) => iniciar(async () => void (await cambiarNegocio(id)))}
    >
      <SelectTrigger aria-label="Negocio" className="h-10 max-w-[60vw] min-w-0 font-medium sm:max-w-xs">
        <Store className="size-4 text-muted-foreground" />
        <SelectValue placeholder="Elige un negocio" />
      </SelectTrigger>
      <SelectContent>
        {negocios.map((n) => (
          <SelectItem key={n.id} value={n.id} className="py-2.5 text-[15px]">
            {n.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
