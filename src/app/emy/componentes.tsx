"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Plus, RotateCcw, Trash2 } from "lucide-react";
import { AvisoError, Campo } from "@/components/layout/campo";
import { Button } from "@/components/ui/button";
import { Dialogo } from "@/components/ui/dialogo";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FONDOS } from "@/lib/fondos";
import { PALETAS } from "@/lib/paletas";
import { cn } from "@/lib/utils";
import {
  agregarLocalAccion,
  cambiarEstadoClienteAccion,
  cambiarLimiteFotosAccion,
  cambiarFondoAccion,
  cambiarPaletaAccion,
  cambiarModulosAccion,
  crearClienteAccion,
  editarClienteAccion,
  registrarPagoAccion,
  reiniciarDemoAccion,
  restablecerContrasenaAccion,
  type EstadoEmy,
} from "./acciones";

// ─── Credenciales: se muestran una sola vez ─────────────────────────────────

export function Credenciales({ usuario, contrasena, titulo }: { usuario: string; contrasena: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Control Total\nhttps://app.controltotalpos.com\nUsuario: ${usuario}\nContraseña temporal: ${contrasena}\n(Al entrar, el sistema te pide crear tu propia contraseña.)`;
  return (
    <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5" role="status">
      <p className="font-semibold">{titulo}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-background p-3">
          <dt className="text-sm text-muted-foreground">Usuario</dt>
          <dd className="font-mono text-lg">{usuario}</dd>
        </div>
        <div className="rounded-xl bg-background p-3">
          <dt className="text-sm text-muted-foreground">Contraseña temporal</dt>
          <dd className="font-mono text-lg">{contrasena}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        Cópiala ahora: no se vuelve a mostrar. Al entrar, el sistema le pide crear su propia contraseña.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
          } catch {}
        }}
      >
        {copiado ? <Check /> : <Copy />} {copiado ? "Copiado" : "Copiar para enviar por WhatsApp"}
      </Button>
    </div>
  );
}

// ─── Datos del cliente (crear y editar) ─────────────────────────────────────

export type DatosClienteFormulario = {
  id: string;
  nombre: string;
  nit: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  mensualidad: number;
  proximoPago: string | null;
  notasEmy: string | null;
};

function CamposDatos({ c, e }: { c?: DatosClienteFormulario; e: Record<string, string> }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Campo id="nombre" etiqueta="Nombre de la empresa" error={e.nombre} className="sm:col-span-2">
        <Input id="nombre" name="nombre" defaultValue={c?.nombre} required maxLength={120} placeholder="Ej.: Repuestos Camila" />
      </Campo>
      <Campo id="nit" etiqueta="NIT o cédula" error={e.nit}>
        <Input id="nit" name="nit" defaultValue={c?.nit ?? ""} maxLength={30} />
      </Campo>
      <Campo id="telefono" etiqueta="Teléfono / WhatsApp" error={e.telefono}>
        <Input id="telefono" name="telefono" defaultValue={c?.telefono ?? ""} maxLength={30} inputMode="tel" />
      </Campo>
      <Campo id="correo" etiqueta="Correo" error={e.correo}>
        <Input id="correo" name="correo" type="email" defaultValue={c?.correo ?? ""} maxLength={120} />
      </Campo>
      <Campo id="direccion" etiqueta="Dirección" error={e.direccion}>
        <Input id="direccion" name="direccion" defaultValue={c?.direccion ?? ""} maxLength={200} />
      </Campo>
      <Campo id="mensualidad" etiqueta="Mensualidad (pesos)" error={e.mensualidad} ayuda="Lo que el cliente paga cada mes.">
        <Input
          id="mensualidad"
          name="mensualidad"
          defaultValue={c ? String(c.mensualidad) : "120000"}
          inputMode="numeric"
          required
        />
      </Campo>
      <Campo
        id="proximoPago"
        etiqueta="Próximo pago"
        error={e.proximoPago}
        ayuda="Día en que debe pagar la siguiente mensualidad."
      >
        <Input id="proximoPago" name="proximoPago" type="date" defaultValue={c?.proximoPago ?? ""} />
      </Campo>
      <Campo
        id="notasEmy"
        etiqueta="Notas internas"
        error={e.notasEmy}
        className="sm:col-span-2"
        ayuda="Solo las ve EMY TELECOM."
      >
        <Textarea id="notasEmy" name="notasEmy" defaultValue={c?.notasEmy ?? ""} maxLength={1000} rows={3} />
      </Campo>
    </div>
  );
}

type Local = { clave: number; nombre: string; direccion: string; tipo: string };

export function FormularioNuevoCliente() {
  const [estado, accion, guardando] = useActionState<EstadoEmy, FormData>(crearClienteAccion, {});
  const [locales, setLocales] = useState<Local[]>([{ clave: 1, nombre: "", direccion: "", tipo: "" }]);
  const router = useRouter();
  const e = estado.campos ?? {};

  if (estado.credenciales) {
    return (
      <div className="max-w-2xl space-y-4">
        <Credenciales titulo="Cliente creado. Estos son los datos para entrar:" {...estado.credenciales} />
        <Button onClick={() => router.push(`/emy/${estado.credenciales!.id}`)}>Ir a la ficha del cliente</Button>
      </div>
    );
  }

  const cambiar = (clave: number, campo: keyof Omit<Local, "clave">, valor: string) =>
    setLocales((l) => l.map((x) => (x.clave === clave ? { ...x, [campo]: valor } : x)));

  return (
    <form action={accion} className="max-w-3xl space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">1. La empresa</h2>
        <CamposDatos e={e} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">2. Sus locales</h2>
        {locales.map((l, i) => (
          <div key={l.clave} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_1fr_1fr_auto] bg-card shadow-suave">
            <Campo id={`localNombre-${l.clave}`} etiqueta={`Local ${i + 1}`}>
              <Input
                id={`localNombre-${l.clave}`}
                name="localNombre"
                value={l.nombre}
                onChange={(ev) => cambiar(l.clave, "nombre", ev.target.value)}
                required
                maxLength={80}
                placeholder="Ej.: Ferretería"
              />
            </Campo>
            <Campo id={`localDireccion-${l.clave}`} etiqueta="Dirección">
              <Input
                id={`localDireccion-${l.clave}`}
                name="localDireccion"
                value={l.direccion}
                onChange={(ev) => cambiar(l.clave, "direccion", ev.target.value)}
                maxLength={200}
              />
            </Campo>
            <Campo id={`localTipo-${l.clave}`} etiqueta="Tipo de negocio">
              <Input
                id={`localTipo-${l.clave}`}
                name="localTipo"
                value={l.tipo}
                onChange={(ev) => cambiar(l.clave, "tipo", ev.target.value)}
                maxLength={60}
                placeholder="Ej.: Ferretería"
              />
            </Campo>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar local ${i + 1}`}
                disabled={locales.length === 1}
                onClick={() => setLocales((x) => x.filter((y) => y.clave !== l.clave))}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
        {e.locales && <p className="text-sm text-destructive">{e.locales}</p>}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setLocales((x) => [...x, { clave: Math.max(...x.map((y) => y.clave)) + 1, nombre: "", direccion: "", tipo: "" }])
          }
        >
          <Plus /> Agregar otro local
        </Button>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">3. Quién lo administra</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo id="adminNombre" etiqueta="Nombre del administrador" error={e.adminNombre}>
            <Input id="adminNombre" name="adminNombre" required maxLength={80} placeholder="Ej.: Camila Pérez" />
          </Campo>
          <Campo
            id="adminUsuario"
            etiqueta="Usuario para entrar"
            error={e.adminUsuario}
            ayuda="Sin espacios ni tildes. Ej.: camila"
          >
            <Input
              id="adminUsuario"
              name="adminUsuario"
              required
              minLength={3}
              maxLength={40}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Campo>
        </div>
        <p className="text-sm text-muted-foreground">
          El sistema le crea una contraseña temporal y te la muestra al guardar. Los cajeros los crea el cliente desde su
          Configuración.
        </p>
      </section>

      <AvisoError mensaje={estado.error} />
      <Button type="submit" size="lg" className="h-12 w-full sm:w-auto" disabled={guardando}>
        {guardando ? "Creando…" : "Crear cliente"}
      </Button>
    </form>
  );
}

export function FormularioEditarCliente({ cliente }: { cliente: DatosClienteFormulario }) {
  const [estado, accion, guardando] = useActionState<EstadoEmy, FormData>(editarClienteAccion, {});
  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="id" value={cliente.id} />
      <CamposDatos c={cliente} e={estado.campos ?? {}} />
      <AvisoError mensaje={estado.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar cambios"}
        </Button>
        {estado.ok && !guardando && <span className="text-sm text-emerald-600">Guardado.</span>}
      </div>
    </form>
  );
}

// ─── Acciones rápidas ───────────────────────────────────────────────────────

/** Ejecuta una acción del servidor con confirmación y muestra su error. */
function useAccion() {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string>();
  const correr = (fn: () => Promise<EstadoEmy>, despues?: (r: EstadoEmy) => void) =>
    iniciar(async () => {
      setError(undefined);
      const r = await fn();
      if (r.error) setError(r.error);
      else despues?.(r);
    });
  return { pendiente, error, correr };
}

export function BotonesEstado({ id, activa, esDemo }: { id: string; activa: boolean; esDemo: boolean }) {
  const { pendiente, error, correr } = useAccion();
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!esDemo && activa && (
          <Button onClick={() => correr(() => registrarPagoAccion(id))} disabled={pendiente}>
            <Check /> Registrar pago del mes
          </Button>
        )}
        {activa ? (
          <Button variant="outline" className="text-destructive" onClick={() => setConfirmar(true)} disabled={pendiente}>
            Suspender
          </Button>
        ) : (
          <Button onClick={() => correr(() => cambiarEstadoClienteAccion(id, true))} disabled={pendiente}>
            Reactivar
          </Button>
        )}
      </div>
      <AvisoError mensaje={error} />
      <Dialogo abierto={confirmar} onCerrar={() => setConfirmar(false)} titulo="¿Suspender este cliente?">
        <p className="text-muted-foreground">
          Nadie de esta empresa podrá entrar y las sesiones abiertas se cierran. Sus datos no se borran: al reactivarlo, todo
          sigue como estaba.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={pendiente}
            onClick={() =>
              correr(
                () => cambiarEstadoClienteAccion(id, false),
                () => setConfirmar(false),
              )
            }
          >
            Sí, suspender
          </Button>
        </div>
      </Dialogo>
    </div>
  );
}

export function Modulos({
  id,
  activos,
  opciones,
}: {
  id: string;
  activos: string[];
  opciones: { valor: string; nombre: string }[];
}) {
  const { pendiente, error, correr } = useAccion();
  const [marcados, setMarcados] = useState(activos);
  const alternar = (valor: string) => {
    const nuevos = marcados.includes(valor) ? marcados.filter((m) => m !== valor) : [...marcados, valor];
    const antes = marcados;
    setMarcados(nuevos);
    correr(() => cambiarModulosAccion(id, nuevos).then((r) => (r.error && setMarcados(antes), r)));
  };
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {opciones.map((m) => (
          <label
            key={m.valor}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border p-3 bg-card shadow-suave",
              marcados.includes(m.valor) ? "border-primary bg-primary/5" : "hover:bg-muted/40",
            )}
          >
            <input
              type="checkbox"
              checked={marcados.includes(m.valor)}
              onChange={() => alternar(m.valor)}
              disabled={pendiente}
              className="size-5 accent-primary"
            />
            <span className="font-medium">{m.nombre}</span>
          </label>
        ))}
      </div>
      <AvisoError mensaje={error} />
    </div>
  );
}

export function LimiteFotos({ id, limite }: { id: string; limite: number }) {
  const { pendiente, error, correr } = useAccion();
  const [valor, setValor] = useState(String(limite));
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        correr(() => cambiarLimiteFotosAccion(id, valor));
      }}
    >
      <Campo id="limiteFotos" etiqueta="Facturas con foto al mes">
        <div className="flex gap-2">
          <Input
            id="limiteFotos"
            inputMode="numeric"
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
            className="max-w-32"
          />
          <Button type="submit" variant="outline" disabled={pendiente || valor === String(limite)}>
            {pendiente ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </Campo>
      <AvisoError mensaje={error} />
    </form>
  );
}

export function ElegirPaleta({ id, actual }: { id: string; actual: string }) {
  const { pendiente, error, correr } = useAccion();
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Colores">
        {PALETAS.map((p) => {
          const elegida = p.valor === actual;
          return (
            <button
              key={p.valor}
              type="button"
              role="radio"
              aria-checked={elegida}
              disabled={pendiente}
              onClick={() => !elegida && correr(() => cambiarPaletaAccion(id, p.valor))}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                elegida ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/60",
              )}
            >
              <span className="flex shrink-0 overflow-hidden rounded-lg border">
                {p.muestra.map((c) => (
                  <span key={c} className="h-10 w-5" style={{ backgroundColor: c }} />
                ))}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{p.nombre}</span>
                <span className="block text-sm text-muted-foreground">{elegida ? "En uso" : p.descripcion}</span>
              </span>
            </button>
          );
        })}
      </div>
      <AvisoError mensaje={error} />
    </div>
  );
}

export function ElegirFondo({ id, actual }: { id: string; actual: string | null }) {
  const { pendiente, error, correr } = useAccion();
  const opciones = [{ valor: null, nombre: "Sin imagen", imagen: null }, ...FONDOS];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Imagen del inicio">
        {opciones.map((f) => {
          const elegida = f.valor === actual;
          return (
            <button
              key={f.valor ?? "ninguna"}
              type="button"
              role="radio"
              aria-checked={elegida}
              disabled={pendiente}
              onClick={() => !elegida && correr(() => cambiarFondoAccion(id, f.valor))}
              className={cn(
                "space-y-2 rounded-xl border p-2 text-left transition-colors",
                elegida ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/60",
              )}
            >
              {/* Muestra sobre la franja de la paleta del panel, como se verá en el inicio. */}
              <span className="relative block h-16 overflow-hidden rounded-lg bg-franja">
                {f.imagen && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.imagen} alt="" className="absolute right-2 top-1/2 h-[85%] -translate-y-1/2 opacity-40" />
                )}
              </span>
              <span className="block px-1 text-sm font-medium">{f.nombre}</span>
            </button>
          );
        })}
      </div>
      <AvisoError mensaje={error} />
    </div>
  );
}

export function AgregarLocal({ empresaId }: { empresaId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, guardando] = useActionState<EstadoEmy, FormData>(async (previo, f) => {
    const r = await agregarLocalAccion(previo, f);
    if (r.ok) setAbierto(false);
    return r;
  }, {});
  const e = estado.campos ?? {};
  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <Plus /> Agregar local
      </Button>
      <Dialogo abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Nuevo local">
        <form action={accion} className="space-y-4">
          <input type="hidden" name="empresaId" value={empresaId} />
          <Campo id="local-nombre" etiqueta="Nombre" error={e.nombre}>
            <Input id="local-nombre" name="nombre" required maxLength={80} />
          </Campo>
          <Campo id="local-direccion" etiqueta="Dirección" error={e.direccion}>
            <Input id="local-direccion" name="direccion" maxLength={200} />
          </Campo>
          <Campo id="local-tipo" etiqueta="Tipo de negocio" error={e.tipo}>
            <Input id="local-tipo" name="tipo" maxLength={60} />
          </Campo>
          <AvisoError mensaje={estado.error} />
          <Button type="submit" disabled={guardando} className="w-full">
            {guardando ? "Guardando…" : "Agregar local"}
          </Button>
        </form>
      </Dialogo>
    </>
  );
}

export function RestablecerContrasena({
  empresaId,
  usuarioId,
  nombre,
}: {
  empresaId: string;
  usuarioId: string;
  nombre: string;
}) {
  const { pendiente, error, correr } = useAccion();
  const [credenciales, setCredenciales] = useState<EstadoEmy["credenciales"]>();
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={pendiente}
        onClick={() =>
          correr(
            () => restablecerContrasenaAccion(empresaId, usuarioId),
            (r) => setCredenciales(r.credenciales),
          )
        }
      >
        <KeyRound /> {pendiente ? "Generando…" : "Nueva contraseña"}
      </Button>
      <AvisoError mensaje={error} />
      <Dialogo abierto={!!credenciales} onCerrar={() => setCredenciales(undefined)} titulo={`Contraseña de ${nombre}`}>
        {credenciales && <Credenciales titulo="Contraseña restablecida y cuenta desbloqueada." {...credenciales} />}
      </Dialogo>
    </>
  );
}

export function BotonReiniciarDemo({ existe }: { existe: boolean }) {
  const { pendiente, error, correr } = useAccion();
  const [confirmar, setConfirmar] = useState(false);
  const [listo, setListo] = useState(false);
  const reiniciar = () =>
    correr(reiniciarDemoAccion, () => {
      setConfirmar(false);
      setListo(true);
    });
  return (
    <div className="space-y-2">
      <Button className="w-full" disabled={pendiente} onClick={() => (existe ? setConfirmar(true) : reiniciar())}>
        <RotateCcw className={cn(pendiente && "animate-spin")} />
        {pendiente ? "Armando la demo…" : existe ? "Reiniciar demo" : "Crear demo"}
      </Button>
      {pendiente && <p className="text-sm text-muted-foreground">Tarda alrededor de un minuto. No cierres la página.</p>}
      {listo && !pendiente && <p className="text-sm text-emerald-600">Demo lista, con datos hasta hoy.</p>}
      <AvisoError mensaje={error} />
      <Dialogo abierto={confirmar} onCerrar={() => !pendiente && setConfirmar(false)} titulo="¿Reiniciar la demo?">
        <p className="text-muted-foreground">
          Se borra todo lo de la demo (y solo de la demo) y se vuelve a armar con un mes de ventas hasta hoy. Los clientes reales
          no se tocan.
        </p>
        {pendiente && <p className="mt-3 text-sm text-muted-foreground">Armando la demo, alrededor de un minuto…</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmar(false)} disabled={pendiente}>
            Cancelar
          </Button>
          <Button onClick={reiniciar} disabled={pendiente}>
            {pendiente ? "Reiniciando…" : "Sí, reiniciar"}
          </Button>
        </div>
      </Dialogo>
    </div>
  );
}
