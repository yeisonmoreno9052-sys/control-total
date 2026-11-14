"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Campo } from "@/components/layout/campo";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CampoPesos } from "@/components/ventas/campo-pesos";
import { COLORES, dibujarPieza } from "@/lib/estados/dibujar";
import {
  ETIQUETAS,
  leerTallas,
  nombreArchivo,
  porcentajeRebaja,
  textoPieza,
  type DisenoPieza,
  type Etiqueta,
  type PiezaEstado,
} from "@/lib/estados/piezas";
import { formatearPesos } from "@/lib/formato";
import type { Paleta } from "@/lib/paletas";
import { Acciones, Lienzo, SubirFoto, useFuentes, useImagenes, useTelefono } from "../comun";

export function EditorPieza({
  pieza,
  marca,
  logoUrl,
  paleta,
  telefono: telefonoNegocio,
  puedeFoto,
}: {
  pieza: PiezaEstado;
  marca: string;
  logoUrl: string | null;
  paleta: Paleta;
  telefono: string | null;
  puedeFoto: boolean;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const fuentes = useFuentes();
  const [fotoUrl, setFotoUrl] = useState(pieza.fotoUrl);
  const imagenes = useImagenes([logoUrl, fotoUrl]);
  const logo = logoUrl ? imagenes.get(logoUrl) : null;
  const foto = fotoUrl ? imagenes.get(fotoUrl) : null;
  const [nombre, setNombre] = useState(pieza.nombre);
  const [detalle, setDetalle] = useState(pieza.descripcion ?? "");
  const [tallas, setTallas] = useState(pieza.tallas.join(", "));
  const [precio, setPrecio] = useState<number | null>(pieza.precio);
  const [oferta, setOferta] = useState<number | null>(null);
  const [etiqueta, setEtiqueta] = useState<Etiqueta>("ninguna");
  const [telefono, setTelefono] = useTelefono(telefonoNegocio);

  const diseno: DisenoPieza = useMemo(
    () => ({
      nombre,
      detalle,
      tallas: leerTallas(tallas),
      precio: precio ?? 0,
      oferta,
      etiqueta,
      telefono,
    }),
    [nombre, detalle, tallas, precio, oferta, etiqueta, telefono],
  );
  const rebaja = oferta ? porcentajeRebaja(precio ?? 0, oferta) : null;

  useEffect(() => {
    const c = lienzo.current?.getContext("2d");
    if (!c || !fuentes) return;
    dibujarPieza(c, diseno, foto ?? null, { logo: logo ?? null, marca }, COLORES[paleta], fuentes);
  }, [diseno, foto, logo, fuentes, marca, paleta]);

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
      <Lienzo lienzo={lienzo} listo={!!fuentes} />

      <div className="space-y-5">
        <section className="space-y-3 rounded-2xl border bg-card p-4 shadow-suave md:p-5">
          <h2 className="font-semibold">Foto</h2>
          {fotoUrl ? (
            <p className="text-sm text-muted-foreground">
              Sale grande arriba. Una foto con buena luz y fondo limpio se ve mejor.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sin foto la imagen sale solo con el texto. {puedeFoto ? "Tómale una para que se vea la prenda." : ""}
            </p>
          )}
          {puedeFoto && <SubirFoto productoId={pieza.productoId} hayFoto={!!fotoUrl} onFoto={setFotoUrl} />}
        </section>

        <section className="grid gap-4 rounded-2xl border bg-card p-4 shadow-suave sm:grid-cols-2 md:p-5">
          <Campo id="e-nombre" etiqueta="Nombre" className="sm:col-span-2">
            <Input id="e-nombre" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo id="e-detalle" etiqueta="Detalle (opcional)" ayuda="Ej.: Bota recta · Tela rígida" className="sm:col-span-2">
            <Input id="e-detalle" value={detalle} maxLength={70} onChange={(e) => setDetalle(e.target.value)} />
          </Campo>
          <Campo
            id="e-tallas"
            etiqueta="Tallas"
            ayuda={
              pieza.tallas.length
                ? "Salen las que hay en stock. Puedes quitar o agregar."
                : "Sepáralas con comas. Vacío: no salen tallas."
            }
          >
            <Input id="e-tallas" value={tallas} maxLength={80} onChange={(e) => setTallas(e.target.value)} />
          </Campo>
          <Campo id="e-precio" etiqueta="Precio">
            <CampoPesos id="e-precio" valor={precio} onValor={setPrecio} />
          </Campo>
          <Campo
            id="e-oferta"
            etiqueta="Precio de oferta (opcional)"
            ayuda={
              rebaja
                ? `El precio normal sale tachado · ${rebaja} % menos`
                : oferta
                  ? "Debe ser menor que el precio."
                  : "Para rebajas. No cambia el precio en la caja."
            }
          >
            <CampoPesos id="e-oferta" valor={oferta} onValor={setOferta} />
          </Campo>
          <Campo id="e-etiqueta" etiqueta="Etiqueta">
            <NativeSelect id="e-etiqueta" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value as Etiqueta)}>
              {Object.entries(ETIQUETAS).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          </Campo>
          <Campo
            id="e-telefono"
            etiqueta="WhatsApp para pedidos"
            ayuda={telefonoNegocio ? "Es el teléfono del negocio." : "Queda guardado en este equipo. Vacío: no sale el botón."}
            className="sm:col-span-2"
          >
            <Input
              id="e-telefono"
              type="tel"
              inputMode="tel"
              value={telefono}
              maxLength={30}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </Campo>
          {pieza.precio !== precio && (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              El precio en la caja sigue siendo {formatearPesos(pieza.precio)}. Este cambio es solo para la imagen.
            </p>
          )}
        </section>

        <Acciones
          lienzo={lienzo}
          nombre={nombreArchivo(nombre)}
          texto={textoPieza(diseno)}
          listo={!!fuentes}
          version={`${JSON.stringify(diseno)}|${imagenes.size}|${fotoUrl}`}
        />
      </div>
    </div>
  );
}
