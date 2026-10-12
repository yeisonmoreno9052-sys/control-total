import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { EncabezadoPagina } from "@/components/layout/encabezado-pagina";
import { Badge } from "@/components/ui/badge";
import { estadoPago, MODULOS, NOMBRE_ACCION, obtenerCliente } from "@/lib/datos/emy";
import { formatearDia, formatearFecha, formatearHora, formatearPesos } from "@/lib/formato";
import { obtenerSuperadmin } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { AgregarLocal, BotonesEstado, FormularioEditarCliente, Modulos, RestablecerContrasena } from "../componentes";

const NOMBRE_ROL: Record<string, string> = { ADMINISTRADOR: "Administrador", SOCIO: "Socio", CAJERO: "Cajero" };
const TEXTO_PAGO = { al_dia: "Al día", vence_pronto: "Vence pronto", vencido: "Pago vencido", sin_fecha: "Sin fecha de pago" };

export default async function FichaCliente({ params }: PageProps<"/emy/[id]">) {
  const ce = await obtenerSuperadmin();
  const { id } = await params;
  const c = await obtenerCliente(ce, id);
  if (!c) notFound();
  const pago = c.esDemo ? "sin_fecha" : estadoPago(c.proximoPago);
  const ahora = new Date();

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo={c.nombre}
        volver={{ href: "/emy", texto: "Clientes" }}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            {c.esDemo ? (
              <Badge>Demostración</Badge>
            ) : c.activa ? (
              <Badge variant={pago === "vencido" ? "destructive" : pago === "vence_pronto" ? "aviso" : "secondary"}>
                {TEXTO_PAGO[pago]}
              </Badge>
            ) : (
              <Badge variant="destructive">Suspendido</Badge>
            )}
            <span>Cliente desde {formatearFecha(c.creadoEn)}</span>
          </span>
        }
      />

      <section className="grid gap-4 rounded-2xl border p-5 md:grid-cols-[1fr_auto] md:items-center bg-card shadow-suave">
        <div>
          <p className="text-sm text-muted-foreground">Mensualidad</p>
          <p className="text-3xl font-bold tabular-nums">{formatearPesos(c.mensualidad)}</p>
          <p className={cn("text-sm text-muted-foreground", pago === "vencido" && c.activa && "font-medium text-destructive")}>
            {c.proximoPago ? `Próximo pago: ${formatearDia(c.proximoPago)}` : "Sin fecha de próximo pago"}
          </p>
        </div>
        <BotonesEstado id={c.id} activa={c.activa} esDemo={c.esDemo} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-2xl border p-5 bg-card shadow-suave">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Locales</h2>
            <AgregarLocal empresaId={c.id} />
          </div>
          <ul className="divide-y">
            {c.locales.map((l) => (
              <li key={l.id} className={cn("flex items-center gap-3 py-3", !l.activo && "opacity-60")}>
                <Store className="size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {l.nombre} {!l.activo && <span className="text-sm text-muted-foreground">(inactivo)</span>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[l.tipo, l.direccion].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 rounded-2xl border p-5 bg-card shadow-suave">
          <h2 className="font-semibold">Usuarios</h2>
          <p className="text-sm text-muted-foreground">
            Si alguien olvidó su contraseña o quedó bloqueado, genérale una nueva y díctasela.
          </p>
          <ul className="divide-y">
            {c.usuarios.map((u) => (
              <li key={u.id} className={cn("flex flex-wrap items-center justify-between gap-3 py-3", !u.activo && "opacity-60")}>
                <div className="min-w-0">
                  <p className="font-medium">{u.nombre}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-mono">{u.usuario}</span> · {NOMBRE_ROL[u.rol] ?? u.rol}
                    {!u.activo && " · inactivo"}
                    {u.bloqueadoHasta && u.bloqueadoHasta > ahora && " · bloqueado"}
                  </p>
                </div>
                {u.activo && <RestablecerContrasena empresaId={c.id} usuarioId={u.id} nombre={u.nombre} />}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="space-y-3 rounded-2xl border p-5 bg-card shadow-suave">
        <h2 className="font-semibold">Módulos activos</h2>
        <p className="text-sm text-muted-foreground">Un módulo apagado desaparece del menú del cliente y deja de funcionar.</p>
        <Modulos id={c.id} activos={c.modulosActivos} opciones={MODULOS} />
      </section>

      <section className="space-y-3 rounded-2xl border p-5 bg-card shadow-suave">
        <h2 className="font-semibold">Datos del cliente</h2>
        <FormularioEditarCliente
          cliente={{
            id: c.id,
            nombre: c.nombre,
            nit: c.nit,
            telefono: c.telefono,
            correo: c.correo,
            direccion: c.direccion,
            mensualidad: c.mensualidad,
            proximoPago: c.proximoPago ? c.proximoPago.toISOString().slice(0, 10) : null,
            notasEmy: c.notasEmy,
          }}
        />
      </section>

      <section className="space-y-3 rounded-2xl border p-5 bg-card shadow-suave">
        <h2 className="font-semibold">Historial</h2>
        {c.acciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
        ) : (
          <ul className="divide-y text-sm">
            {c.acciones.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{NOMBRE_ACCION[a.accion] ?? a.accion}</span>
                  <span className="text-muted-foreground"> · {a.usuario.nombre}</span>
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {formatearFecha(a.creadoEn)} {formatearHora(a.creadoEn)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
