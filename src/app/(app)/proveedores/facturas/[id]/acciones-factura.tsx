"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Ban, Camera, FileText, Plus, Trash2, X } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { formatearPesos } from "@/lib/formato";
import { cn } from "@/lib/utils";
import {
  abonoAccion,
  anularAbonoAccion,
  anularFacturaAccion,
  eliminarAdjuntoAccion,
  subirAdjuntoAccion,
  type EstadoAccion,
} from "../../acciones";

export function RegistrarPago({ facturaId, saldo }: { facturaId: string; saldo: number }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}>
        <Plus /> Registrar pago
      </Button>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Registrar pago">
        <FormularioPago facturaId={facturaId} saldo={saldo} onListo={() => setAbierto(false)} />
      </Dialogo>
    </>
  );
}

function FormularioPago({ facturaId, saldo, onListo }: { facturaId: string; saldo: number; onListo: () => void }) {
  const [valor, setValor] = useState<number | null>(saldo);
  const [medio, setMedio] = useState<"EFECTIVO" | "TRANSFERENCIA">("TRANSFERENCIA");
  const [desdeCaja, setDesdeCaja] = useState(true);
  const [referencia, setReferencia] = useState("");
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!valor) return setError("Escribe el valor del pago.");
    setEnviando(true);
    try {
      const r = await abonoAccion({ facturaId, valor, medio, desdeCaja: medio === "EFECTIVO" && desdeCaja, referencia });
      if (r.ok) onListo();
      else setError(r.error);
    } catch {
      setError("No pudimos registrar el pago. Revisa la conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <Campo id="valor" etiqueta="Valor" ayuda={`Saldo: ${formatearPesos(saldo)}. Si pagas menos, queda como abono.`}>
        <CampoPesos
          id="valor"
          valor={valor}
          onValor={(v) => {
            setValor(v);
            setError(undefined);
          }}
          className="h-14 text-2xl font-semibold"
        />
      </Campo>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Medio de pago">
        {(
          [
            ["EFECTIVO", "Efectivo"],
            ["TRANSFERENCIA", "Transferencia"],
          ] as const
        ).map(([m, nombre]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={medio === m}
            onClick={() => setMedio(m)}
            className={cn(
              "h-12 rounded-lg border font-medium",
              medio === m ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-muted",
            )}
          >
            {nombre}
          </button>
        ))}
      </div>
      {medio === "EFECTIVO" ? (
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-primary"
            checked={desdeCaja}
            onChange={(e) => setDesdeCaja(e.target.checked)}
          />
          <span>
            <span className="font-medium">El dinero sale de la caja de hoy</span>
            <span className="block text-sm text-muted-foreground">Se descuenta del efectivo esperado en el cierre.</span>
          </span>
        </label>
      ) : (
        <Campo id="referencia" etiqueta="Referencia (opcional)">
          <Input id="referencia" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} />
        </Campo>
      )}
      <AvisoError mensaje={error} />
      <Button type="submit" size="lg" className="w-full" disabled={enviando}>
        {enviando ? "Registrando…" : "Registrar pago"}
      </Button>
    </form>
  );
}

export function BotonAnularAbono({ abonoId, valor }: { abonoId: string; valor: number }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="text-right">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Anular pago"
        disabled={pendiente}
        onClick={() => {
          if (!window.confirm(`¿Anular este pago de ${formatearPesos(valor)}? La factura vuelve a quedar con ese saldo.`)) return;
          iniciar(async () => {
            const r = await anularAbonoAccion(abonoId);
            setError(r.ok ? undefined : r.error);
          });
        }}
      >
        <X className="size-5 text-muted-foreground" />
      </Button>
      {error && <p className="max-w-48 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function AnularFactura({ facturaId, conPagos }: { facturaId: string; conPagos: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="border-t pt-6">
      <Button variant="outline" size="lg" className="text-destructive" onClick={() => setAbierto(true)}>
        <Ban /> Anular factura
      </Button>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Anular factura">
        {conPagos ? (
          <div className="space-y-4">
            <p>Esta factura tiene pagos registrados. Anula primero los pagos (con la ✕ de cada uno) y después la factura.</p>
            <Button variant="outline" className="w-full" onClick={() => setAbierto(false)} data-autofocus>
              Entendido
            </Button>
          </div>
        ) : (
          <FormularioAnular facturaId={facturaId} onListo={() => setAbierto(false)} />
        )}
      </Dialogo>
    </div>
  );
}

function FormularioAnular({ facturaId, onListo }: { facturaId: string; onListo: () => void }) {
  const [estado, accion, anulando] = useActionState<EstadoAccion, FormData>(async (previo, datos) => {
    const r = await anularFacturaAccion(previo, datos);
    if (r.ok) onListo();
    return r;
  }, {});
  return (
    <form action={accion} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Los productos vuelven a salir del inventario. La factura no se borra: queda marcada como anulada, con tu nombre y el motivo.
        El costo promedio de los productos no cambia.
      </p>
      <input type="hidden" name="facturaId" value={facturaId} />
      <Campo id="motivo" etiqueta="Motivo" error={estado.campos?.motivo}>
        <Textarea id="motivo" name="motivo" required minLength={3} maxLength={300} placeholder="Ej.: la registré dos veces" />
      </Campo>
      <AvisoError mensaje={estado.error} />
      <Button type="submit" variant="destructive" size="lg" className="w-full" disabled={anulando}>
        {anulando ? "Anulando…" : "Anular factura"}
      </Button>
    </form>
  );
}

type Adjunto = { id: string; nombre: string; tipo: string; tamano: number };

/** Achica una foto en el navegador: lado mayor de 1600 px y JPEG, unos 300 KB. Así cabe y se lee bien. */
async function achicarFoto(archivo: File): Promise<Blob> {
  const imagen = await createImageBitmap(archivo);
  const escala = Math.min(1, 1600 / Math.max(imagen.width, imagen.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(imagen.width * escala);
  lienzo.height = Math.round(imagen.height * escala);
  lienzo.getContext("2d")!.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
  imagen.close();
  return new Promise((resolver, rechazar) =>
    lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error("sin imagen"))), "image/jpeg", 0.8),
  );
}

export function Adjuntos({ facturaId, adjuntos }: { facturaId: string; adjuntos: Adjunto[] }) {
  const camara = useRef<HTMLInputElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string>();
  const [pendiente, iniciar] = useTransition();
  const lleno = adjuntos.length >= 3;

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    e.target.value = "";
    if (!elegido) return;
    setSubiendo(true);
    setError(undefined);
    try {
      let datos: Blob = elegido;
      let nombre = elegido.name;
      if (elegido.type.startsWith("image/")) {
        datos = await achicarFoto(elegido);
        nombre = nombre.replace(/\.[^.]+$/, "") + ".jpg";
      }
      const f = new FormData();
      f.set("facturaId", facturaId);
      f.set("archivo", new File([datos], nombre, { type: datos.type }));
      const r = await subirAdjuntoAccion(f);
      if (!r.ok) setError(r.error);
    } catch {
      setError("No pudimos subir el archivo. Revisa la conexión e intenta de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Factura física</h2>
      {adjuntos.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-3">
          {adjuntos.map((a) => (
            <li key={a.id} className="relative overflow-hidden rounded-xl border">
              <a href={`/api/adjuntos/${a.id}`} target="_blank" rel="noopener" className="block">
                {a.tipo.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la app
                  <img src={`/api/adjuntos/${a.id}`} alt={a.nombre} className="h-40 w-full bg-muted object-cover" />
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
                    <FileText className="size-10" /> PDF
                  </div>
                )}
                <p className="truncate px-3 py-2 text-sm">{a.nombre}</p>
              </a>
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2"
                aria-label={`Quitar ${a.nombre}`}
                disabled={pendiente}
                onClick={() => {
                  if (!window.confirm("¿Quitar este archivo de la factura?")) return;
                  iniciar(async () => {
                    const r = await eliminarAdjuntoAccion(a.id);
                    if (!r.ok) setError(r.error);
                  });
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!lleno && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={subiendo} onClick={() => camara.current?.click()}>
            <Camera /> {subiendo ? "Subiendo…" : "Tomar foto"}
          </Button>
          <Button variant="outline" disabled={subiendo} onClick={() => archivo.current?.click()}>
            <FileText /> Subir foto o PDF
          </Button>
          <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={subir} />
          <input ref={archivo} type="file" accept="image/*,application/pdf" className="hidden" onChange={subir} />
        </div>
      )}
      <p className="text-sm text-muted-foreground">Hasta 3 archivos de máximo 2 MB. Las fotos se achican solas.</p>
      <AvisoError mensaje={error} />
    </section>
  );
}
