"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, ScanBarcode, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { irACodigo } from "./acciones";

/**
 * Búsqueda instantánea. El lector de código de barras escribe como un teclado y
 * termina con Enter: si el código coincide exacto, abre ese producto.
 */
export function Buscador() {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [valor, setValor] = useState(params.get("q") ?? "");
  const [buscando, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

  function aplicar(q: string) {
    const nuevos = new URLSearchParams(params);
    if (q.trim()) nuevos.set("q", q.trim());
    else nuevos.delete("q");
    nuevos.delete("pagina");
    iniciar(() => router.replace(`${ruta}?${nuevos.toString()}`, { scroll: false }));
  }

  function cambiar(q: string) {
    setValor(q);
    clearTimeout(espera.current);
    espera.current = setTimeout(() => aplicar(q), 250);
  }

  async function alPresionarTecla(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      cambiar("");
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    clearTimeout(espera.current);
    const q = valor.trim();
    if (!q) return;
    const id = await irACodigo(q);
    if (id) {
      setValor("");
      router.push(`/inventario/${id}`);
    } else {
      aplicar(q);
    }
  }

  // En computador el buscador queda listo para escanear apenas carga la página.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) entrada.current?.focus();
  }, []);

  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={entrada}
        type="search"
        value={valor}
        onChange={(e) => cambiar(e.target.value)}
        onKeyDown={alPresionarTecla}
        placeholder="Buscar o escanear código…"
        aria-label="Buscar producto por nombre, código o código de barras"
        autoComplete="off"
        className="h-12 pr-10 pl-10 text-base"
      />
      <span className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
        {buscando ? <Loader2 className="size-5 animate-spin" /> : <ScanBarcode className="size-5" />}
      </span>
    </div>
  );
}
