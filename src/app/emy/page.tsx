import Link from "next/link";
import {
  Building2,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Plus,
  PlayCircle,
  Sparkles,
  Store,
  UserX,
} from "lucide-react";
import { EstadoVacio } from "@/components/layout/estado-vacio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONTRASENA_DEMO, obtenerDemo, USUARIOS_DEMO } from "@/lib/datos/demo";
import { esClienteReal, listarClientes, resumirClientes, type ClienteFila } from "@/lib/datos/emy";
import { formatearDia, formatearFecha, formatearPesos } from "@/lib/formato";
import { obtenerSuperadmin } from "@/lib/sesion";
import { cn } from "@/lib/utils";
import { BotonReiniciarDemo } from "./componentes";

export default async function PanelEmy() {
  const ce = await obtenerSuperadmin();
  const [clientes, demo] = await Promise.all([listarClientes(ce), obtenerDemo(ce)]);
  const reales = clientes.filter(esClienteReal);
  const ahora = new Date();
  const demosClientes = clientes
    .filter((c) => c.pruebaHasta)
    .sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime());
  const r = resumirClientes(clientes);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{formatearFecha(new Date())}</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Clientes de Control Total</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" variant="outline" className="h-12">
            <Link href="/emy/demo-cliente">
              <Sparkles /> Demo para un cliente
            </Link>
          </Button>
          <Button asChild size="lg" className="h-12">
            <Link href="/emy/nuevo">
              <Plus /> Nuevo cliente
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-2xl bg-gradient-to-br from-destacado-desde to-destacado-hasta p-5 text-white shadow-lg shadow-indigo-500/20 lg:col-span-1">
          <p className="flex items-center gap-2 text-sm text-white/80">
            <CircleDollarSign className="size-4" /> Mensualidades al mes
          </p>
          <p className="text-3xl font-bold tracking-tight tabular-nums">{formatearPesos(r.mensualidades)}</p>
          <p className="mt-1 text-sm text-white/80">De los clientes activos</p>
        </div>
        <Cifra icono={Building2} titulo="Clientes activos" valor={r.activos} />
        <Cifra icono={CalendarClock} titulo="Pagos vencidos" valor={r.vencidos} rojo={r.vencidos > 0} />
        <Cifra icono={UserX} titulo="Suspendidos" valor={r.suspendidos} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Clientes</h2>
        {reales.length === 0 ? (
          <EstadoVacio
            icono={Store}
            titulo="Todavía no hay clientes"
            descripcion="Crea el primer comercio: su empresa, sus locales y el usuario de quien lo administra."
            accion={
              <Button asChild>
                <Link href="/emy/nuevo">Crear cliente</Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {reales.map((c) => (
              <li key={c.id}>
                <TarjetaCliente c={c} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Demos de clientes</h2>
        {demosClientes.length === 0 ? (
          <EstadoVacio
            icono={Sparkles}
            titulo="Ninguna demo para clientes"
            descripcion="Crea una con el nombre del negocio del prospecto: entra y la ve como suya desde el primer día."
            accion={
              <Button asChild>
                <Link href="/emy/demo-cliente">Crear demo para un cliente</Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {demosClientes.map((c) => (
              <li key={c.id}>
                <TarjetaDemoCliente c={c} ahora={ahora} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Demostración general</h2>
        <div className="grid gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 md:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-semibold">
              <PlayCircle className="size-5 text-primary" /> Demo Control Total
            </p>
            <p className="text-sm text-muted-foreground">
              Cuatro locales de ejemplo (repuestos de moto, ferretería, cafetería y almacén de ropa) con un mes de ventas,
              compras, gastos y cierres de caja. Dale al prospecto el usuario de un negocio como el suyo: solo ve ese local. Si
              alguien la desordena, reiníciala.
            </p>
            <p className="text-sm font-medium">Por tipo de negocio</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {USUARIOS_DEMO.filter((u) => u.negocio).map((u) => (
                <div key={u.usuario} className="rounded-xl bg-background p-3">
                  <dt className="font-medium">{u.negocio}</dt>
                  <dd className="font-mono">
                    {u.usuario} · {CONTRASENA_DEMO}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm font-medium">Todos los locales</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {USUARIOS_DEMO.filter((u) => !u.negocio).map((u) => (
                <div key={u.usuario} className="rounded-xl bg-background p-3">
                  <dt className="text-muted-foreground">{u.nombre}</dt>
                  <dd className="font-mono">
                    {u.usuario} · {CONTRASENA_DEMO}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted-foreground">
              {demo
                ? `${demo.productos.toLocaleString("es-CO")} productos y ${demo.ventas.toLocaleString("es-CO")} ventas.${
                    demo.reiniciadaEn ? ` Reiniciada el ${formatearFecha(demo.reiniciadaEn)}.` : ""
                  }`
                : "Todavía no se ha creado: tócala para armarla."}
            </p>
          </div>
          <div className="flex flex-col gap-2 md:w-56">
            <BotonReiniciarDemo existe={!!demo} />
            {demo && (
              <Button asChild variant="outline">
                <Link href={`/emy/${demo.id}`}>Ver ficha</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Cifra({
  icono: Icono,
  titulo,
  valor,
  rojo = false,
}: {
  icono: typeof Store;
  titulo: string;
  valor: number;
  rojo?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border p-5 bg-card shadow-suave", rojo && "border-destructive/40 bg-destructive/5")}>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icono className="size-4" /> {titulo}
      </p>
      <p className={cn("text-3xl font-bold tabular-nums", rojo && "text-destructive")}>{valor}</p>
    </div>
  );
}

const PAGO = {
  al_dia: { texto: "Al día", variante: "secondary" },
  vence_pronto: { texto: "Vence pronto", variante: "aviso" },
  vencido: { texto: "Pago vencido", variante: "destructive" },
  sin_fecha: { texto: "Sin fecha de pago", variante: "outline" },
} as const;

function TarjetaCliente({ c }: { c: ClienteFila }) {
  const pago = PAGO[c.estadoPago];
  return (
    <Link
      href={`/emy/${c.id}`}
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl border p-5 hover:bg-muted/40 bg-card shadow-suave",
        !c.activa && "opacity-70",
        c.activa && c.estadoPago === "vencido" && "border-destructive/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{c.nombre}</p>
          <p className="truncate text-sm text-muted-foreground">
            {[c.nit && `NIT ${c.nit}`, c.telefono].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </div>
      <div className="flex flex-wrap gap-2">
        {c.activa ? <Badge variant={pago.variante}>{pago.texto}</Badge> : <Badge variant="destructive">Suspendido</Badge>}
        <Badge variant="outline">{formatearPesos(c.mensualidad)}/mes</Badge>
        {c.proximoPago && <Badge variant="outline">Paga el {formatearDia(c.proximoPago)}</Badge>}
      </div>
      <dl className="grid grid-cols-4 gap-2 text-center text-sm">
        <Dato titulo="Locales" valor={c.locales} />
        <Dato titulo="Usuarios" valor={c.usuarios} />
        <Dato titulo="Productos" valor={c.productos} />
        <Dato titulo="Ventas 30 d" valor={c.ventas30Dias} />
      </dl>
      <p className="text-xs text-muted-foreground">
        {c.ultimaVenta ? `Última venta: ${formatearFecha(c.ultimaVenta)}` : "Aún no ha vendido"}
      </p>
    </Link>
  );
}

/** Días que le quedan a una demo de cliente (0 = vence hoy, negativo = ya venció). */
function diasQueQuedan(hasta: Date, ahora: Date) {
  return Math.ceil((hasta.getTime() - ahora.getTime()) / 86_400_000);
}

function TarjetaDemoCliente({ c, ahora }: { c: ClienteFila; ahora: Date }) {
  const quedan = diasQueQuedan(c.pruebaHasta!, ahora);
  const vencida = c.pruebaHasta! <= ahora;
  return (
    <Link
      href={`/emy/${c.id}`}
      className={cn("flex h-full flex-col gap-3 rounded-2xl border p-5 hover:bg-muted/40 bg-card shadow-suave", vencida && "opacity-70")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{c.nombre}</p>
          <p className="truncate text-sm text-muted-foreground">{c.telefono || "Sin teléfono"}</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </div>
      <div className="flex flex-wrap gap-2">
        {vencida ? (
          <Badge variant="destructive">Terminó el {formatearFecha(c.pruebaHasta!)}</Badge>
        ) : (
          <Badge variant={quedan <= 3 ? "aviso" : "secondary"}>
            {quedan <= 1 ? "Último día" : `Le quedan ${quedan} días`}
          </Badge>
        )}
        <Badge variant="outline">Creada el {formatearFecha(c.creadoEn)}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {/* Las ventas de ejemplo se arman en el primer minuto: lo que venga después lo vendió el cliente. */}
        {c.ultimaVenta && c.ultimaVenta.getTime() > c.creadoEn.getTime() + 30 * 60_000
          ? `La ha usado: última venta ${formatearFecha(c.ultimaVenta)}`
          : "Todavía no ha vendido en la demo"}
      </p>
    </Link>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="flex flex-col-reverse rounded-lg bg-muted/60 p-2">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className="font-semibold tabular-nums">{valor.toLocaleString("es-CO")}</dd>
    </div>
  );
}
