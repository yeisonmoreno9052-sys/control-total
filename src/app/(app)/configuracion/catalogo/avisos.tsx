"use client";

import { useState, useTransition } from "react";
import { BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describirLinea, linkWhatsapp, mensajeLlego } from "@/lib/catalogo/catalogo";
import type { AvisoVista } from "@/lib/datos/catalogo";
import { formatearFecha } from "@/lib/formato";
import { marcarAvisadoAccion } from "./acciones";

/**
 * Clientes esperando una talla. "Escribirle" abre WhatsApp con el mensaje listo y saca al
 * cliente de la lista. Los que ya se pueden avisar (llegó la talla) salen primero.
 */
export function ListaAvisos({ avisos, negocio, base, compacta = false }: { avisos: AvisoVista[]; negocio: string; base: string; compacta?: boolean }) {
  const [hechos, setHechos] = useState<string[]>([]);
  const [, empezar] = useTransition();
  const visibles = avisos.filter((a) => !hechos.includes(a.id)).sort((a, b) => Number(b.llego) - Number(a.llego));

  if (!visibles.length) {
    return compacta ? null : (
      <p className="text-sm text-muted-foreground">
        Nadie está esperando una talla por ahora. Cuando un cliente toque &quot;Avísame cuando llegue&quot; en el catálogo, aparece aquí.
      </p>
    );
  }
  const quitar = (id: string) => {
    setHechos((h) => [...h, id]);
    empezar(async () => {
      await marcarAvisadoAccion(id);
    });
  };
  return (
    <ul className="divide-y rounded-xl border">
      {visibles.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {a.cliente || "Cliente"} <span className="font-normal text-muted-foreground">· {a.telefono.replace(/^57/, "")}</span>
            </p>
            <p className="text-sm">{describirLinea(a)}</p>
            <p className="text-xs text-muted-foreground">Lo pidió el {formatearFecha(a.creadoEn)}</p>
          </div>
          {a.llego ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">¡Ya llegó!</span>
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Esperando</span>
          )}
          <div className="flex gap-2">
            <Button asChild size="sm" className={a.llego ? "bg-[#25d366] text-white hover:bg-[#1fb457]" : ""} variant={a.llego ? "default" : "outline"}>
              <a
                href={linkWhatsapp(a.telefono, mensajeLlego(negocio, a, a.clave ? `${base}/p/${a.clave}` : base))}
                target="_blank"
                rel="noopener"
                onClick={() => quitar(a.id)}
              >
                <BellRing className="size-4" /> Escribirle
              </a>
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => quitar(a.id)} title="Quitar de la lista sin escribirle">
              <Check className="size-4" /> Listo
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
