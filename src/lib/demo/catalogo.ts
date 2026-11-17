// Productos, proveedores y gastos de ejemplo para la empresa de demostración.
// Son inventados pero realistas para cuatro tipos de comercio de Colombia (repuestos de
// moto, ferretería, cafetería y almacén de ropa), con precios aproximados en pesos.
// Cada local tiene su propio usuario de demostración que solo ve ese local, para
// mostrarle a cada prospecto un negocio como el suyo.

export type ProductoDemo = {
  nombre: string;
  categoria: string;
  costo: number;
  /** Unidad de medida; por defecto UNIDAD. */
  unidad?: "UNIDAD" | "METRO" | "KILO" | "GALON" | "LITRO";
  iva?: 0 | 19;
  /** Pieza usada, comprada a un particular. */
  segunda?: boolean;
  /** Cuántas se venden en un día normal (sirve para repartir las ventas). */
  rotacion?: number;
  /** No se cuenta (tinto, jugos, lo que se prepara al momento): se vende siempre y no mueve stock. */
  sinStock?: boolean;
  /** Aparece como cuadro para tocar en la caja (cafetería). */
  boton?: boolean;
  /** Prenda con tallas y colores: se crea una variante por combinación. */
  tallas?: string[];
  colores?: string[];
};

export type NegocioDemo = {
  nombre: string;
  direccion: string;
  tipo: string;
  prefijo: string;
  margen: number;
  categorias: string[];
  productos: ProductoDemo[];
  proveedores: { nombre: string; nit: string; contacto: string; telefono: string }[];
  /** Usuario de demostración que solo ve este local (rol socio). */
  usuario: { usuario: string; nombre: string };
  /** Ventas en un día normal. */
  ventasDia: number;
  /** Base con la que se abre la caja. */
  baseCaja: number;
  /** El local no abre el domingo (hoy siempre queda abierto para mostrarlo). */
  cierraDomingo?: boolean;
  /** Gastos fijos: nómina por quincena y arriendo mensual. */
  nomina: number;
  arriendo: number;
  /** Configuración del local. */
  ivaPorDefecto?: number;
  botonesRapidos?: boolean;
  usaTallas?: boolean;
  aceptaTarjeta?: boolean;
};

/**
 * Variantes de un producto base: "Llanta 90/90-18", "Llanta 100/90-18"…
 * El número de cada variante es su costo en % del costo base (100 = igual).
 */
function variantes(base: Omit<ProductoDemo, "nombre">, nombre: string, lista: [string, number][]): ProductoDemo[] {
  return lista.map(([v, factor]) => ({
    ...base,
    nombre: `${nombre} ${v}`,
    costo: Math.round((base.costo * factor) / 100 / 100) * 100,
  }));
}

const MOTOS: NegocioDemo = {
  nombre: "Repuestos de moto",
  direccion: "Cra. 52 # 45-10, Medellín",
  tipo: "Repuestos de moto",
  prefijo: "MOT",
  margen: 35,
  usuario: { usuario: "demo.motos", nombre: "Andrés (dueño del almacén de motos)" },
  ventasDia: 22,
  baseCaja: 100_000,
  nomina: 1_200_000,
  arriendo: 1_500_000,
  categorias: ["Aceites y lubricantes", "Llantas", "Frenos", "Transmisión", "Eléctricos", "Filtros", "Accesorios", "Usados"],
  proveedores: [
    { nombre: "Distrimotos del Valle", nit: "900123456-1", contacto: "Carlos Ruiz", telefono: "3104567890" },
    { nombre: "Lubricantes Antioquia", nit: "901234567-2", contacto: "Paola Gómez", telefono: "3112345678" },
    { nombre: "Llantas y Rines Medellín", nit: "800987654-3", contacto: "Jorge Pérez", telefono: "3209876543" },
    { nombre: "Importadora Motopartes", nit: "901555444-5", contacto: "Luisa Mejía", telefono: "3157654321" },
  ],
  productos: [
    ...variantes({ categoria: "Aceites y lubricantes", costo: 21000, iva: 19, rotacion: 6 }, "Aceite 4T 20W-50", [
      ["Mobil 1 L", 100],
      ["Motul 1 L", 115],
      ["Castrol 1 L", 105],
      ["Havoline 1 L", 95],
    ]),
    ...variantes({ categoria: "Aceites y lubricantes", costo: 26000, iva: 19, rotacion: 2 }, "Aceite semisintético 10W-40", [
      ["Motul 1 L", 100],
      ["Mobil 1 L", 96],
    ]),
    { nombre: "Lubricante de cadena 400 ml", categoria: "Aceites y lubricantes", costo: 14000, iva: 19, rotacion: 2 },
    { nombre: "Líquido de frenos DOT 4 250 ml", categoria: "Aceites y lubricantes", costo: 9000, iva: 19, rotacion: 1 },
    { nombre: "Refrigerante para moto 1 L", categoria: "Aceites y lubricantes", costo: 12000, iva: 19, rotacion: 1 },
    ...variantes({ categoria: "Llantas", costo: 98000, iva: 19, rotacion: 1 }, "Llanta", [
      ["2.75-18 delantera", 90],
      ["90/90-18 trasera", 100],
      ["100/90-18 trasera", 112],
      ["80/100-17 delantera", 88],
      ["110/70-17 trasera", 125],
      ["130/70-17 trasera", 150],
      ["3.00-18 trasera", 104],
    ]),
    ...variantes({ categoria: "Llantas", costo: 19000, iva: 19, rotacion: 1 }, "Neumático (tubo)", [
      ["18", 100],
      ["17", 95],
    ]),
    ...variantes({ categoria: "Frenos", costo: 12000, iva: 19, rotacion: 3 }, "Pastillas de freno", [
      ["Pulsar 180", 100],
      ["FZ 2.0", 105],
      ["NKD 125", 85],
      ["Boxer CT 100", 80],
      ["AKT 125", 82],
      ["XTZ 125", 95],
      ["CB 160", 110],
    ]),
    ...variantes({ categoria: "Frenos", costo: 16000, iva: 19, rotacion: 1 }, "Bandas de freno", [
      ["Boxer", 100],
      ["AKT", 95],
      ["Eco Deluxe", 90],
    ]),
    ...variantes({ categoria: "Frenos", costo: 9000, iva: 19, rotacion: 1 }, "Guaya de freno", [
      ["Boxer", 100],
      ["NKD", 100],
      ["Libero", 105],
    ]),
    ...variantes({ categoria: "Transmisión", costo: 85000, iva: 19, rotacion: 1 }, "Kit de arrastre", [
      ["Boxer CT 100", 100],
      ["Pulsar 180", 140],
      ["NKD 125", 95],
      ["FZ 2.0", 150],
      ["AKT 125", 92],
    ]),
    ...variantes({ categoria: "Transmisión", costo: 32000, iva: 19, rotacion: 1 }, "Cadena 428H", [
      ["118 eslabones", 100],
      ["120 eslabones", 104],
    ]),
    ...variantes({ categoria: "Transmisión", costo: 11000, iva: 19, rotacion: 1 }, "Guaya de clutch", [
      ["Boxer", 100],
      ["Pulsar", 110],
      ["NKD", 100],
    ]),
    ...variantes({ categoria: "Eléctricos", costo: 7000, iva: 19, rotacion: 3 }, "Bujía", [
      ["NGK C7HSA", 100],
      ["NGK CR7HSA", 115],
      ["NGK D8EA", 120],
      ["Champion P-RZ9HC", 90],
    ]),
    ...variantes({ categoria: "Eléctricos", costo: 78000, iva: 19, rotacion: 1 }, "Batería", [
      ["YTX7L-BS", 100],
      ["YTZ5S", 85],
      ["12N5-3B", 70],
      ["YTX9-BS", 125],
    ]),
    ...variantes({ categoria: "Eléctricos", costo: 3500, iva: 19, rotacion: 3 }, "Bombillo", [
      ["farola H4", 250],
      ["stop 12V", 100],
      ["direccional 12V", 90],
      ["LED farola H4", 600],
    ]),
    { nombre: "Direccional LED (par)", categoria: "Eléctricos", costo: 22000, iva: 19, rotacion: 1 },
    { nombre: "Pito 12V universal", categoria: "Eléctricos", costo: 9000, iva: 19, rotacion: 1 },
    ...variantes({ categoria: "Filtros", costo: 8000, iva: 19, rotacion: 2 }, "Filtro de aceite", [
      ["Pulsar", 100],
      ["FZ", 110],
      ["XTZ", 105],
      ["CB 160", 115],
    ]),
    ...variantes({ categoria: "Filtros", costo: 12000, iva: 19, rotacion: 1 }, "Filtro de aire", [
      ["Boxer", 100],
      ["NKD", 95],
      ["Pulsar 180", 120],
      ["FZ 2.0", 125],
    ]),
    ...variantes({ categoria: "Accesorios", costo: 95000, iva: 19, rotacion: 1 }, "Casco certificado", [
      ["abierto talla M", 80],
      ["abierto talla L", 80],
      ["integral talla M", 140],
      ["integral talla L", 140],
    ]),
    { nombre: "Guantes de moto (par)", categoria: "Accesorios", costo: 25000, iva: 19, rotacion: 1 },
    { nombre: "Impermeable de moto", categoria: "Accesorios", costo: 42000, iva: 19, rotacion: 1 },
    { nombre: "Chaleco reflectivo", categoria: "Accesorios", costo: 12000, iva: 19, rotacion: 1 },
    { nombre: "Espejo retrovisor universal", categoria: "Accesorios", costo: 9000, iva: 19, rotacion: 2 },
    { nombre: "Manigueta de freno Pulsar", categoria: "Accesorios", costo: 11000, iva: 19, rotacion: 1 },
    { nombre: "Puño acelerador (par)", categoria: "Accesorios", costo: 8000, iva: 19, rotacion: 1 },
    { nombre: "Tapa de tanque Boxer", categoria: "Usados", costo: 15000, segunda: true, rotacion: 0.3 },
    { nombre: "Rin trasero Pulsar 180", categoria: "Usados", costo: 120000, segunda: true, rotacion: 0.2 },
    { nombre: "Tanque de gasolina NKD", categoria: "Usados", costo: 90000, segunda: true, rotacion: 0.2 },
    { nombre: "Farola completa FZ", categoria: "Usados", costo: 70000, segunda: true, rotacion: 0.2 },
    { nombre: "Carburador Boxer CT 100", categoria: "Usados", costo: 60000, segunda: true, rotacion: 0.3 },
    { nombre: "Velocímetro AKT 125", categoria: "Usados", costo: 45000, segunda: true, rotacion: 0.2 },
  ],
};

const FERRETERIA: NegocioDemo = {
  nombre: "Ferretería",
  direccion: "Calle 30 # 70-22, Medellín",
  tipo: "Ferretería",
  prefijo: "FER",
  margen: 30,
  usuario: { usuario: "demo.ferreteria", nombre: "Sandra (dueña de la ferretería)" },
  ventasDia: 42,
  baseCaja: 150_000,
  cierraDomingo: true,
  nomina: 1_000_000,
  arriendo: 1_300_000,
  categorias: ["Tornillería", "Eléctricos", "Pinturas", "Herramientas", "Plomería", "Construcción"],
  proveedores: [
    { nombre: "Ferretería Mayorista El Tornillo", nit: "900765432-1", contacto: "Andrés López", telefono: "3001234567" },
    { nombre: "Cables y Conductores S.A.S.", nit: "901888777-6", contacto: "Diana Ríos", telefono: "3018765432" },
    { nombre: "Pinturas del Norte", nit: "800444333-2", contacto: "Felipe Cano", telefono: "3123456789" },
    { nombre: "Cementos y Agregados Antioquia", nit: "900222111-9", contacto: "Marta Zapata", telefono: "3134567890" },
  ],
  productos: [
    ...variantes({ categoria: "Tornillería", costo: 120, iva: 19, rotacion: 25 }, "Tornillo drywall", [
      ['6 x 1"', 100],
      ['6 x 1-1/4"', 110],
      ['8 x 2"', 160],
      ['8 x 3"', 220],
    ]),
    ...variantes({ categoria: "Tornillería", costo: 250, iva: 19, rotacion: 15 }, "Tornillo hexagonal galvanizado", [
      ['1/4 x 1"', 100],
      ['1/4 x 2"', 140],
      ['5/16 x 2"', 180],
      ['3/8 x 2"', 240],
      ['1/2 x 3"', 420],
    ]),
    ...variantes({ categoria: "Tornillería", costo: 80, iva: 19, rotacion: 20 }, "Chazo plástico", [
      ['1/4"', 100],
      ['5/16"', 130],
      ['3/8"', 170],
    ]),
    ...variantes({ categoria: "Tornillería", costo: 9000, iva: 19, unidad: "KILO", rotacion: 3 }, "Puntilla con cabeza", [
      ['1"', 100],
      ['2"', 95],
      ['2-1/2"', 95],
      ['3"', 92],
    ]),
    ...variantes({ categoria: "Tornillería", costo: 150, iva: 19, rotacion: 12 }, "Tuerca hexagonal", [
      ['1/4"', 100],
      ['5/16"', 130],
      ['3/8"', 170],
    ]),
    ...variantes({ categoria: "Tornillería", costo: 80, iva: 19, rotacion: 12 }, "Arandela plana", [
      ['1/4"', 100],
      ['3/8"', 150],
    ]),
    { nombre: "Alambre negro #18", categoria: "Tornillería", costo: 8500, iva: 19, unidad: "KILO", rotacion: 2 },
    { nombre: "Alambre galvanizado #12", categoria: "Tornillería", costo: 11000, iva: 19, unidad: "KILO", rotacion: 1 },
    ...variantes({ categoria: "Eléctricos", costo: 1800, iva: 19, unidad: "METRO", rotacion: 10 }, "Cable THHN", [
      ["#14 rojo", 100],
      ["#14 negro", 100],
      ["#12 rojo", 140],
      ["#12 negro", 140],
      ["#10 negro", 210],
    ]),
    { nombre: "Cable dúplex 2x16", categoria: "Eléctricos", costo: 1300, iva: 19, unidad: "METRO", rotacion: 6 },
    ...variantes({ categoria: "Eléctricos", costo: 6500, iva: 19, rotacion: 3 }, "Toma doble", [
      ["blanca", 100],
      ["con polo a tierra", 130],
    ]),
    ...variantes({ categoria: "Eléctricos", costo: 5500, iva: 19, rotacion: 3 }, "Interruptor", [
      ["sencillo", 100],
      ["doble", 140],
      ["conmutable", 160],
    ]),
    ...variantes({ categoria: "Eléctricos", costo: 7000, iva: 19, rotacion: 4 }, "Bombillo LED", [
      ["9 W", 100],
      ["12 W", 125],
      ["18 W", 180],
    ]),
    { nombre: "Cinta aislante 3M", categoria: "Eléctricos", costo: 3500, iva: 19, rotacion: 4 },
    { nombre: "Breaker 20 A", categoria: "Eléctricos", costo: 14000, iva: 19, rotacion: 1 },
    { nombre: "Extensión eléctrica 5 m", categoria: "Eléctricos", costo: 16000, iva: 19, rotacion: 1 },
    ...variantes({ categoria: "Pinturas", costo: 52000, iva: 19, unidad: "GALON", rotacion: 1 }, "Pintura vinilo tipo 1", [
      ["blanco", 100],
      ["blanco hueso", 100],
      ["gris", 102],
      ["azul", 105],
    ]),
    ...variantes({ categoria: "Pinturas", costo: 28000, iva: 19, unidad: "LITRO", rotacion: 1 }, "Esmalte sintético", [
      ["negro", 100],
      ["blanco", 100],
      ["rojo", 105],
    ]),
    { nombre: "Thinner corriente", categoria: "Pinturas", costo: 9000, iva: 19, unidad: "LITRO", rotacion: 2 },
    ...variantes({ categoria: "Pinturas", costo: 4500, iva: 19, rotacion: 2 }, "Brocha", [
      ['1"', 100],
      ['2"', 140],
      ['3"', 190],
      ['4"', 240],
    ]),
    { nombre: 'Rodillo de felpa 9"', categoria: "Pinturas", costo: 11000, iva: 19, rotacion: 1 },
    { nombre: "Lija de agua #150", categoria: "Pinturas", costo: 1200, iva: 19, rotacion: 5 },
    { nombre: "Masilla para drywall 5 kg", categoria: "Pinturas", costo: 24000, iva: 19, rotacion: 1 },
    { nombre: "Martillo de uña 16 oz", categoria: "Herramientas", costo: 22000, iva: 19, rotacion: 1 },
    { nombre: 'Alicate universal 8"', categoria: "Herramientas", costo: 16000, iva: 19, rotacion: 1 },
    { nombre: "Destornillador de pala", categoria: "Herramientas", costo: 6000, iva: 19, rotacion: 1 },
    { nombre: "Destornillador de estrella", categoria: "Herramientas", costo: 6000, iva: 19, rotacion: 1 },
    { nombre: "Flexómetro 5 m", categoria: "Herramientas", costo: 12000, iva: 19, rotacion: 1 },
    { nombre: 'Llave de expansión 10"', categoria: "Herramientas", costo: 21000, iva: 19, rotacion: 1 },
    { nombre: "Segueta con marco", categoria: "Herramientas", costo: 15000, iva: 19, rotacion: 1 },
    { nombre: 'Disco de corte metal 4-1/2"', categoria: "Herramientas", costo: 3200, iva: 19, rotacion: 3 },
    { nombre: 'Broca para concreto 1/4"', categoria: "Herramientas", costo: 4500, iva: 19, rotacion: 2 },
    { nombre: 'Taladro percutor 1/2" 650 W', categoria: "Herramientas", costo: 165000, iva: 19, rotacion: 0.2 },
    { nombre: 'Pulidora 4-1/2" 820 W', categoria: "Herramientas", costo: 175000, iva: 19, rotacion: 0.2 },
    { nombre: "Taladro usado Black & Decker", categoria: "Herramientas", costo: 70000, iva: 0, segunda: true, rotacion: 0.1 },
    ...variantes({ categoria: "Plomería", costo: 6000, iva: 19, rotacion: 2 }, "Tubo PVC presión 3 m", [
      ['1/2"', 100],
      ['3/4"', 140],
      ['1"', 210],
    ]),
    ...variantes({ categoria: "Plomería", costo: 900, iva: 19, rotacion: 5 }, "Codo PVC 90°", [
      ['1/2"', 100],
      ['3/4"', 140],
    ]),
    { nombre: "Soldadura PVC 1/32 gal", categoria: "Plomería", costo: 9000, iva: 19, rotacion: 2 },
    { nombre: "Cinta teflón", categoria: "Plomería", costo: 1200, iva: 19, rotacion: 4 },
    { nombre: 'Llave de paso 1/2"', categoria: "Plomería", costo: 12000, iva: 19, rotacion: 1 },
    { nombre: "Grifería lavamanos sencilla", categoria: "Plomería", costo: 38000, iva: 19, rotacion: 0.3 },
    { nombre: 'Manguera jardín 1/2"', categoria: "Plomería", costo: 1500, iva: 19, unidad: "METRO", rotacion: 4 },
    { nombre: "Cemento gris 50 kg", categoria: "Construcción", costo: 30000, iva: 19, rotacion: 3 },
    { nombre: "Cemento gris", categoria: "Construcción", costo: 700, iva: 19, unidad: "KILO", rotacion: 8 },
    { nombre: "Arena de pega", categoria: "Construcción", costo: 180, iva: 0, unidad: "KILO", rotacion: 20 },
    { nombre: "Pegante cerámico 25 kg", categoria: "Construcción", costo: 22000, iva: 19, rotacion: 1 },
    { nombre: 'Varilla corrugada 3/8" x 6 m', categoria: "Construcción", costo: 21000, iva: 19, rotacion: 2 },
    { nombre: "Malla electrosoldada", categoria: "Construcción", costo: 9500, iva: 19, unidad: "METRO", rotacion: 1 },
    { nombre: "Plástico negro calibre 6", categoria: "Construcción", costo: 2200, iva: 19, unidad: "METRO", rotacion: 3 },
  ],
};

const CAFETERIA: NegocioDemo = {
  nombre: "Cafetería",
  direccion: "Cra. 43A # 10-35, Medellín",
  tipo: "Cafetería",
  prefijo: "CAF",
  margen: 150,
  usuario: { usuario: "demo.cafe", nombre: "Valentina (dueña de la cafetería)" },
  ventasDia: 45,
  baseCaja: 80_000,
  nomina: 900_000,
  arriendo: 1_800_000,
  ivaPorDefecto: 0,
  botonesRapidos: true,
  categorias: ["Bebidas calientes", "Bebidas frías", "Desayunos", "Panadería", "Postres", "Snacks y empacados"],
  proveedores: [
    { nombre: "Café de Origen Antioquia", nit: "901321654-1", contacto: "Julián Restrepo", telefono: "3105551234" },
    { nombre: "Lácteos La Montaña", nit: "800321987-4", contacto: "Gloria Arango", telefono: "3115559876" },
    { nombre: "Panadería Mayorista El Trigal", nit: "900654789-2", contacto: "Hernán Ospina", telefono: "3205554321" },
    { nombre: "Distribuidora de Bebidas del Valle", nit: "901987321-7", contacto: "Camilo Vélez", telefono: "3135556789" },
  ],
  productos: [
    { nombre: "Tinto", categoria: "Bebidas calientes", costo: 700, sinStock: true, boton: true, rotacion: 25 },
    { nombre: "Café con leche", categoria: "Bebidas calientes", costo: 1300, sinStock: true, boton: true, rotacion: 12 },
    { nombre: "Capuchino", categoria: "Bebidas calientes", costo: 2200, sinStock: true, boton: true, rotacion: 8 },
    { nombre: "Latte", categoria: "Bebidas calientes", costo: 2400, sinStock: true, boton: true, rotacion: 5 },
    { nombre: "Americano", categoria: "Bebidas calientes", costo: 1400, sinStock: true, boton: true, rotacion: 5 },
    { nombre: "Mocaccino", categoria: "Bebidas calientes", costo: 2800, sinStock: true, boton: true, rotacion: 3 },
    { nombre: "Aromática", categoria: "Bebidas calientes", costo: 600, sinStock: true, boton: true, rotacion: 5 },
    { nombre: "Chocolate en leche", categoria: "Bebidas calientes", costo: 1800, sinStock: true, boton: true, rotacion: 6 },
    { nombre: "Milo caliente", categoria: "Bebidas calientes", costo: 2000, sinStock: true, rotacion: 2 },
    { nombre: "Jugo natural en agua", categoria: "Bebidas frías", costo: 1800, sinStock: true, boton: true, rotacion: 8 },
    { nombre: "Jugo natural en leche", categoria: "Bebidas frías", costo: 2400, sinStock: true, boton: true, rotacion: 6 },
    { nombre: "Limonada natural", categoria: "Bebidas frías", costo: 1600, sinStock: true, boton: true, rotacion: 6 },
    { nombre: "Limonada de coco", categoria: "Bebidas frías", costo: 3200, sinStock: true, rotacion: 3 },
    { nombre: "Frappé de café", categoria: "Bebidas frías", costo: 3600, sinStock: true, boton: true, rotacion: 4 },
    { nombre: "Malteada de vainilla", categoria: "Bebidas frías", costo: 4000, sinStock: true, rotacion: 2 },
    { nombre: "Gaseosa 400 ml", categoria: "Bebidas frías", costo: 1700, rotacion: 8 },
    { nombre: "Agua sin gas 600 ml", categoria: "Bebidas frías", costo: 1100, rotacion: 6 },
    { nombre: "Jugo Hit 500 ml", categoria: "Bebidas frías", costo: 1900, rotacion: 4 },
    { nombre: "Té frío 400 ml", categoria: "Bebidas frías", costo: 1800, rotacion: 3 },
    { nombre: "Cerveza Club Colombia", categoria: "Bebidas frías", costo: 2800, rotacion: 3 },
    { nombre: "Desayuno tradicional (huevos, arepa y chocolate)", categoria: "Desayunos", costo: 5200, sinStock: true, boton: true, rotacion: 6 },
    { nombre: "Calentado paisa", categoria: "Desayunos", costo: 6800, sinStock: true, boton: true, rotacion: 4 },
    { nombre: "Huevos al gusto", categoria: "Desayunos", costo: 2800, sinStock: true, rotacion: 4 },
    { nombre: "Arepa con queso", categoria: "Desayunos", costo: 1800, sinStock: true, boton: true, rotacion: 8 },
    { nombre: "Sándwich de jamón y queso", categoria: "Desayunos", costo: 4000, sinStock: true, boton: true, rotacion: 5 },
    { nombre: "Tostadas francesas", categoria: "Desayunos", costo: 4400, sinStock: true, rotacion: 2 },
    { nombre: "Pandebono", categoria: "Panadería", costo: 800, boton: true, rotacion: 15 },
    { nombre: "Buñuelo", categoria: "Panadería", costo: 700, boton: true, rotacion: 12 },
    { nombre: "Empanada de carne", categoria: "Panadería", costo: 1000, boton: true, rotacion: 14 },
    { nombre: "Croissant", categoria: "Panadería", costo: 1800, rotacion: 5 },
    { nombre: "Pan de queso", categoria: "Panadería", costo: 900, rotacion: 6 },
    { nombre: "Almojábana", categoria: "Panadería", costo: 900, rotacion: 6 },
    { nombre: "Pastel de pollo", categoria: "Panadería", costo: 1600, rotacion: 6 },
    { nombre: "Pan aliñado", categoria: "Panadería", costo: 1200, rotacion: 3 },
    { nombre: "Torta de chocolate (porción)", categoria: "Postres", costo: 2600, boton: true, rotacion: 4 },
    { nombre: "Cheesecake de frutos rojos", categoria: "Postres", costo: 3800, rotacion: 2 },
    { nombre: "Brownie", categoria: "Postres", costo: 1600, rotacion: 4 },
    { nombre: "Galleta de avena", categoria: "Postres", costo: 900, rotacion: 4 },
    { nombre: "Tres leches", categoria: "Postres", costo: 2600, rotacion: 2 },
    { nombre: "Arroz con leche", categoria: "Postres", costo: 1700, rotacion: 2 },
    { nombre: "Papas fritas paquete", categoria: "Snacks y empacados", costo: 1700, rotacion: 4 },
    { nombre: "Chocolatina Jet", categoria: "Snacks y empacados", costo: 900, rotacion: 5 },
    { nombre: "Chicles Trident", categoria: "Snacks y empacados", costo: 1300, rotacion: 3 },
    { nombre: "Galletas Festival", categoria: "Snacks y empacados", costo: 1100, rotacion: 3 },
    { nombre: "Maní salado", categoria: "Snacks y empacados", costo: 1300, rotacion: 2 },
    { nombre: "Café molido 500 g para llevar", categoria: "Snacks y empacados", costo: 14000, rotacion: 0.5 },
  ],
};

const ROPA: NegocioDemo = {
  nombre: "Almacén de ropa",
  direccion: "Calle 50 # 49-20, Medellín",
  tipo: "Almacén de ropa",
  prefijo: "ROP",
  margen: 80,
  usuario: { usuario: "demo.ropa", nombre: "Paula (dueña del almacén de ropa)" },
  ventasDia: 8,
  baseCaja: 100_000,
  cierraDomingo: true,
  nomina: 1_100_000,
  arriendo: 2_000_000,
  usaTallas: true,
  aceptaTarjeta: true,
  categorias: ["Dama", "Caballero", "Jeans", "Calzado", "Accesorios"],
  proveedores: [
    { nombre: "Confecciones El Hueco", nit: "900111222-3", contacto: "Rubén Correa", telefono: "3006667788" },
    { nombre: "Textiles Itagüí S.A.S.", nit: "901444555-6", contacto: "Natalia Giraldo", telefono: "3016668899" },
    { nombre: "Calzado Bucaramanga", nit: "800777888-1", contacto: "Óscar Rueda", telefono: "3176661122" },
  ],
  productos: [
    { nombre: "Blusa manga corta", categoria: "Dama", costo: 22000, iva: 19, rotacion: 2, tallas: ["S", "M", "L"], colores: ["Blanco", "Negro", "Rosado"] },
    { nombre: "Blusa de tiras", categoria: "Dama", costo: 18000, iva: 19, rotacion: 1.5, tallas: ["S", "M", "L"], colores: ["Negro", "Beige"] },
    { nombre: "Vestido casual", categoria: "Dama", costo: 42000, iva: 19, rotacion: 0.8, tallas: ["S", "M", "L"], colores: ["Azul", "Verde"] },
    { nombre: "Falda plisada", categoria: "Dama", costo: 30000, iva: 19, rotacion: 0.5, tallas: ["S", "M", "L"], colores: ["Negro"] },
    { nombre: "Leggins deportivos", categoria: "Dama", costo: 20000, iva: 19, rotacion: 1.2, tallas: ["S", "M", "L", "XL"], colores: ["Negro", "Gris"] },
    { nombre: "Camiseta básica", categoria: "Caballero", costo: 16000, iva: 19, rotacion: 2.5, tallas: ["S", "M", "L", "XL"], colores: ["Blanco", "Negro", "Azul"] },
    { nombre: "Camisa tipo polo", categoria: "Caballero", costo: 28000, iva: 19, rotacion: 1, tallas: ["M", "L", "XL"], colores: ["Azul", "Blanco"] },
    { nombre: "Camisa manga larga", categoria: "Caballero", costo: 38000, iva: 19, rotacion: 0.6, tallas: ["M", "L", "XL"], colores: ["Blanco", "Azul"] },
    { nombre: "Bermuda", categoria: "Caballero", costo: 26000, iva: 19, rotacion: 0.8, tallas: ["30", "32", "34"], colores: ["Beige", "Azul"] },
    { nombre: "Jean dama tiro alto", categoria: "Jeans", costo: 48000, iva: 19, rotacion: 1.5, tallas: ["6", "8", "10", "12"], colores: ["Azul"] },
    { nombre: "Jean caballero clásico", categoria: "Jeans", costo: 52000, iva: 19, rotacion: 1, tallas: ["30", "32", "34", "36"], colores: ["Azul", "Negro"] },
    { nombre: "Tenis urbanos", categoria: "Calzado", costo: 68000, iva: 19, rotacion: 0.6, tallas: ["37", "38", "39", "40", "41"], colores: ["Blanco"] },
    { nombre: "Sandalias", categoria: "Calzado", costo: 32000, iva: 19, rotacion: 0.6, tallas: ["36", "37", "38", "39"], colores: ["Negro", "Café"] },
    { nombre: "Gorra", categoria: "Accesorios", costo: 12000, iva: 19, rotacion: 0.8, tallas: ["Única"], colores: ["Negro", "Blanco"] },
    { nombre: "Correa de cuero", categoria: "Accesorios", costo: 18000, iva: 19, rotacion: 0.5, tallas: ["Única"], colores: ["Negro", "Café"] },
    { nombre: "Medias tobilleras x3", categoria: "Accesorios", costo: 6000, iva: 19, rotacion: 2 },
    { nombre: "Bolso de mano", categoria: "Accesorios", costo: 45000, iva: 19, rotacion: 0.3 },
  ],
};

export const NEGOCIOS_DEMO = [MOTOS, FERRETERIA, CAFETERIA, ROPA];

export const EMPRESA_DEMO = {
  nombre: "Demo Control Total",
  nit: "900000000-0",
  telefono: "3000000000",
  direccion: "Medellín, Antioquia",
};

/** Usuarios de la demo. La contraseña es conocida: se le da a quien ve la demostración. */
export type UsuarioDemo = {
  usuario: string;
  nombre: string;
  rol: "ADMINISTRADOR" | "SOCIO" | "CAJERO";
  /** Solo para los usuarios por tipo de negocio: el único local que ven. */
  negocio?: string;
};

export const USUARIOS_DEMO: UsuarioDemo[] = [
  { usuario: "demo", nombre: "Laura (administradora)", rol: "ADMINISTRADOR" },
  { usuario: "demo.cajero", nombre: "Mateo (cajero)", rol: "CAJERO" },
  // Uno por tipo de negocio: ve solo su local, como si fuera el dueño.
  ...[MOTOS, FERRETERIA, CAFETERIA, ROPA].map((n): UsuarioDemo => ({ ...n.usuario, rol: "SOCIO", negocio: n.nombre })),
];
export const CONTRASENA_DEMO = "demo2026";
