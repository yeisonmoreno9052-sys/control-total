"use client";

import { useActionState, useState } from "react";
import { Banknote, Landmark } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { cn } from "@/lib/utils";
import { registrarMovimientoAccion, type EstadoAccion } from "../acciones";

type Opcion = { valor: string; nombre: string };

export function FormularioMovimiento({
  tipo,
  categorias,
  hoy,
}: {
  tipo: "EGRESO" | "INGRESO";
  categorias: Opcion[];
  hoy: string;
}) {
  const [estado, accion, guardando] = useActionState<EstadoAccion, FormData>(registrarMovimientoAccion, {});
  const [categoria, setCategoria] = useState(categorias[0].valor);
  const [valor, setValor] = useState<number | null>(null);
  const [medio, setMedio] = useState<"EFECTIVO" | "TRANSFERENCIA">("EFECTIVO");
  const [fecha, setFecha] = useState(hoy);
  const e = estado.campos ?? {};
  const tocaCaja = medio === "EFECTIVO" && fecha === hoy;
  const egreso = tipo === "EGRESO";

  return (
    <form action={accion} className="max-w-xl space-y-5">
      <input type="hidden" name="valor" value={valor ?? ""} />
      <input type="hidden" name="medio" value={medio} />
      <Campo id="categoria" etiqueta="¿De qué es?" error={e.categoria}>
        <NativeSelect id="categoria" name="categoria" value={categoria} onChange={(ev) => setCategoria(ev.target.value)}>
          {categorias.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.nombre}
            </option>
          ))}
        </NativeSelect>
      </Campo>
      {categoria === "RETIRO_DUENO" && (
        <p className="-mt-2 text-sm text-muted-foreground">
          El retiro del dueño se descuenta de la caja, pero no cuenta como gasto del negocio en la utilidad.
        </p>
      )}
      <Campo id="valor" etiqueta="Valor" error={e.valor}>
        <CampoPesos id="valor" autoFocus valor={valor} onValor={setValor} className="h-14 text-2xl font-semibold" />
      </Campo>
      <div className="grid gap-5 sm:grid-cols-2">
        <Campo id="fecha" etiqueta="Fecha" error={e.fecha}>
          <Input
            id="fecha"
            name="fecha"
            type="date"
            max={hoy}
            value={fecha}
            onChange={(ev) => setFecha(ev.target.value)}
            required
          />
        </Campo>
        <div className="space-y-2">
          <span className="text-sm font-medium">Medio</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Medio">
            {(
              [
                ["EFECTIVO", "Efectivo", Banknote],
                ["TRANSFERENCIA", "Transferencia", Landmark],
              ] as const
            ).map(([m, nombre, Icono]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={medio === m}
                onClick={() => setMedio(m)}
                className={cn(
                  "flex h-11 items-center justify-center gap-1.5 rounded-md border text-sm font-medium",
                  medio === m ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary" : "hover:bg-muted",
                )}
              >
                <Icono className="size-4" /> {nombre}
              </button>
            ))}
          </div>
        </div>
      </div>
      {tocaCaja && (
        <label className="flex items-start gap-3 rounded-lg border p-3">
          <input type="checkbox" name="desdeCaja" defaultChecked className="mt-1 size-4" />
          <span>
            <span className="font-medium">{egreso ? "Sale de la caja de hoy" : "Entra a la caja de hoy"}</span>
            <span className="block text-sm text-muted-foreground">
              {egreso
                ? "El cierre de caja lo descuenta. Desmárcalo si la plata no salió del cajón."
                : "El cierre de caja lo suma. Desmárcalo si la plata no entró al cajón."}
            </span>
          </span>
        </label>
      )}
      {categoria === "NOMINA" && (
        <Campo
          id="pagadoA"
          etiqueta="Pagado a (opcional)"
          error={e.pagadoA}
          ayuda="Nombre del empleado, para ver cuánto se le ha pagado."
        >
          <Input id="pagadoA" name="pagadoA" maxLength={80} />
        </Campo>
      )}
      <Campo id="nota" etiqueta="Nota (opcional)" error={e.nota}>
        <Textarea
          id="nota"
          name="nota"
          maxLength={300}
          placeholder={egreso ? "Ej.: quincena del 1 al 15" : "Ej.: base extra para cambio"}
        />
      </Campo>
      <AvisoError mensaje={estado.error} />
      <Button type="submit" size="lg" className="h-14 w-full text-lg sm:w-auto" disabled={guardando || !valor}>
        {guardando ? "Guardando…" : egreso ? "Registrar egreso" : "Registrar ingreso"}
      </Button>
    </form>
  );
}
