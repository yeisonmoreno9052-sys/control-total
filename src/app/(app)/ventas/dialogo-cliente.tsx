"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { ClienteVista } from "@/lib/datos/clientes";
import { buscarClientesCaja, crearClienteCaja } from "./acciones";

// Copia de TIPOS_DOCUMENTO (ese archivo es del servidor).
const TIPOS = [
  ["CC", "Cédula"],
  ["NIT", "NIT"],
  ["CE", "Cédula de extranjería"],
  ["PASAPORTE", "Pasaporte"],
  ["TI", "Tarjeta de identidad"],
  ["OTRO", "Otro"],
] as const;

export function DialogoCliente({
  abierto,
  onElegir,
  onCerrar,
}: {
  abierto: boolean;
  onElegir: (c: ClienteVista) => void;
  onCerrar: () => void;
}) {
  const [creando, setCreando] = useState<string | null>(null);
  const cerrar = () => {
    setCreando(null);
    onCerrar();
  };
  const elegir = (c: ClienteVista) => {
    setCreando(null);
    onElegir(c);
  };
  return (
    <Dialogo abierto={abierto} onCerrar={cerrar} titulo={creando !== null ? "Cliente nuevo" : "Cliente"}>
      {creando !== null ? (
        <FormularioCliente inicial={creando} onCreado={elegir} onVolver={() => setCreando(null)} />
      ) : (
        <BuscarCliente onElegir={elegir} onCrear={setCreando} />
      )}
    </Dialogo>
  );
}

function BuscarCliente({ onElegir, onCrear }: { onElegir: (c: ClienteVista) => void; onCrear: (texto: string) => void }) {
  const [texto, setTexto] = useState("");
  const [respuesta, setRespuesta] = useState<{ q: string; clientes: ClienteVista[] } | null>(null);
  const pedido = useRef(0);

  useEffect(() => {
    const q = texto.trim();
    const n = ++pedido.current;
    if (q.length < 2) return;
    const espera = setTimeout(async () => {
      const clientes = await buscarClientesCaja(q);
      if (n === pedido.current) setRespuesta({ q, clientes });
    }, 200);
    return () => clearTimeout(espera);
  }, [texto]);
  // Solo se muestran los resultados de lo que está escrito ahora.
  const resultados = respuesta && respuesta.q === texto.trim() ? respuesta.clientes : null;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && resultados?.length) {
              e.preventDefault();
              onElegir(resultados[0]);
            }
          }}
          placeholder="Cédula, NIT, teléfono o nombre"
          aria-label="Buscar cliente"
          className="h-12 pl-10 text-lg"
        />
      </div>
      {resultados && (
        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
          {resultados.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">No hay clientes con esos datos.</li>
          ) : (
            resultados.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onElegir(c)} className="w-full px-4 py-3 text-left hover:bg-muted">
                  <p className="font-medium">{c.nombre}</p>
                  <p className="text-sm text-muted-foreground">
                    {[c.numeroDocumento && `${c.tipoDocumento} ${c.numeroDocumento}`, c.telefono].filter(Boolean).join(" · ") || "Sin documento"}
                  </p>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => onCrear(texto.trim())}>
        <UserPlus /> Crear cliente nuevo
      </Button>
    </div>
  );
}

function FormularioCliente({
  inicial,
  onCreado,
  onVolver,
}: {
  inicial: string;
  onCreado: (c: ClienteVista) => void;
  onVolver: () => void;
}) {
  // Si lo que buscó era un número, lo ponemos como documento; si no, como nombre.
  const esNumero = /^[\d.\s-]+$/.test(inicial);
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setEnviando(true);
    try {
      const r = await crearClienteCaja(datos);
      if (r.ok) return onCreado(r.cliente);
      setError(r.error);
      setCampos(r.campos ?? {});
    } catch {
      setError("No pudimos guardar el cliente. Revisa la conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-4" noValidate>
      <Campo id="cli-nombre" etiqueta="Nombre" error={campos.nombre}>
        <Input id="cli-nombre" name="nombre" defaultValue={esNumero ? "" : inicial} autoFocus={!esNumero} required maxLength={150} />
      </Campo>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3">
        <Campo id="cli-tipo" etiqueta="Documento" error={campos.tipoDocumento}>
          <NativeSelect id="cli-tipo" name="tipoDocumento" defaultValue="CC">
            {TIPOS.map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </Campo>
        <Campo id="cli-numero" etiqueta="Número (opcional)" error={campos.numeroDocumento}>
          <Input id="cli-numero" name="numeroDocumento" defaultValue={esNumero ? inicial : ""} inputMode="numeric" maxLength={30} />
        </Campo>
      </div>
      <Campo id="cli-telefono" etiqueta="Celular (opcional)" error={campos.telefono} ayuda="Para mandarle el recibo por WhatsApp.">
        <Input id="cli-telefono" name="telefono" type="tel" inputMode="tel" maxLength={30} autoFocus={esNumero && !!inicial} />
      </Campo>
      <Campo id="cli-correo" etiqueta="Correo (opcional)" error={campos.correo}>
        <Input id="cli-correo" name="correo" type="email" maxLength={150} />
      </Campo>
      <AvisoError mensaje={error ?? undefined} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="lg" onClick={onVolver}>
          Volver
        </Button>
        <Button type="submit" size="lg" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar y usar"}
        </Button>
      </div>
    </form>
  );
}
