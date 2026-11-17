"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OpcionPromocion } from "@/lib/datos/promociones";
import { cn } from "@/lib/utils";
import { buscarParaPromocionAccion, crearPromocionAccion } from "../acciones";

type Categoria = { id: string; nombre: string };

export function FormularioPromocion({ categorias, hoy, semana }: { categorias: Categoria[]; hoy: string; semana: string }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"PORCENTAJE" | "PRECIO">("PORCENTAJE");
  const [valor, setValor] = useState("");
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(semana);
  const [cats, setCats] = useState<string[]>([]);
  const [elegidas, setElegidas] = useState<OpcionPromocion[]>([]);
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<OpcionPromocion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) return;
    let vigente = true;
    const espera = setTimeout(async () => {
      const r = await buscarParaPromocionAccion(t);
      if (vigente) setResultados(r);
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [texto]);

  const alternarCat = (id: string) => setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const agregar = (o: OpcionPromocion) => {
    setElegidas((e) => (e.some((x) => x.clave === o.clave) ? e : [...e, o]));
    setTexto("");
    setResultados([]);
  };
  const quitar = (clave: string) => setElegidas((e) => e.filter((x) => x.clave !== clave));

  function guardar() {
    setError(null);
    const datos = {
      nombre,
      tipo,
      valor: Number(valor.replace(/\D/g, "")),
      desde,
      hasta,
      categoriaIds: cats,
      prendaIds: elegidas.filter((e) => e.clave.startsWith("p:")).map((e) => e.clave.slice(2)),
      productoIds: elegidas.filter((e) => e.clave.startsWith("s:")).map((e) => e.clave.slice(2)),
    };
    iniciar(async () => {
      const r = await crearPromocionAccion(datos);
      if (!r.ok) return setError(r.error);
      router.push(`/inventario/promociones?creada=${r.productos}`);
    });
  }

  const opcionTipo = (t: typeof tipo, texto: string) => (
    <button
      type="button"
      onClick={() => setTipo(t)}
      className={cn(
        "h-12 flex-1 rounded-lg border text-base font-medium transition-colors",
        tipo === t ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
      )}
    >
      {texto}
    </button>
  );

  return (
    <div className="space-y-6 rounded-xl border bg-card p-5 shadow-suave">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre de la promoción</Label>
        <Input id="nombre" className="h-12 text-base" placeholder="Ej.: Black Friday" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} />
      </div>

      <div className="space-y-2">
        <Label>¿Cómo es el descuento?</Label>
        <div className="flex gap-2">
          {opcionTipo("PORCENTAJE", "Porcentaje (%)")}
          {opcionTipo("PRECIO", "Precio especial ($)")}
        </div>
        <div className="flex items-center gap-2">
          {tipo === "PRECIO" && <span className="text-lg font-semibold">$</span>}
          <Input
            inputMode="numeric"
            className="h-12 max-w-40 text-lg"
            placeholder={tipo === "PORCENTAJE" ? "20" : "49.900"}
            value={valor}
            onChange={(e) => {
              const n = e.target.value.replace(/\D/g, "");
              setValor(tipo === "PRECIO" && n ? Number(n).toLocaleString("es-CO") : n);
            }}
          />
          {tipo === "PORCENTAJE" && <span className="text-lg font-semibold">% de descuento</span>}
        </div>
        {tipo === "PRECIO" && <p className="text-sm text-muted-foreground">Cada prenda escogida se vende a este precio esos días.</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="desde">Desde</Label>
          <Input id="desde" type="date" className="h-12 text-base" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hasta">Hasta (incluido)</Label>
          <Input id="hasta" type="date" className="h-12 text-base" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      {categorias.length > 0 && (
        <div className="space-y-2">
          <Label>Categorías completas</Label>
          <p className="text-sm text-muted-foreground">Toca una categoría para poner en promoción todo lo que tiene.</p>
          <div className="flex flex-wrap gap-2">
            {categorias.map((c) => {
              const activa = cats.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => alternarCat(c.id)}
                  className={cn(
                    "inline-flex h-10 items-center gap-1 rounded-full border px-4 text-sm font-medium",
                    activa ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                  )}
                >
                  {activa && <Check className="size-4" />} {c.nombre}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="buscar">Prendas sueltas</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="buscar"
            className="h-12 pl-10 text-base"
            placeholder="Busca o escanea una prenda"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
          />
          {texto.trim().length >= 2 && resultados.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover shadow-lg">
              {resultados.map((o) => (
                <li key={o.clave}>
                  <button type="button" onClick={() => agregar(o)} className="w-full px-4 py-3 text-left hover:bg-accent">
                    <span className="font-medium">{o.nombre}</span>
                    <span className="block text-sm text-muted-foreground">{o.detalle}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {elegidas.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {elegidas.map((o) => (
              <li key={o.clave} className="inline-flex items-center gap-1 rounded-full bg-accent py-1 pr-1 pl-3 text-sm font-medium text-accent-foreground">
                {o.nombre}
                <button type="button" aria-label={`Quitar ${o.nombre}`} onClick={() => quitar(o.clave)} className="rounded-full p-1 hover:bg-background/60">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
          {error}
        </p>
      )}
      <Button size="lg" className="h-12 w-full text-base" disabled={pendiente} onClick={guardar}>
        {pendiente ? "Guardando…" : "Guardar promoción"}
      </Button>
    </div>
  );
}
