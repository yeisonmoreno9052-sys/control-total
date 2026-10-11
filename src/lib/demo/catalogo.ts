// Productos, proveedores y gastos de ejemplo para la empresa de demostración.
// Son inventados pero realistas para un almacén de repuestos de moto y una ferretería
// de Colombia, con precios aproximados en pesos.

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

export const NEGOCIOS_DEMO = [MOTOS, FERRETERIA];

export const EMPRESA_DEMO = {
  nombre: "Demo Control Total",
  nit: "900000000-0",
  telefono: "3000000000",
  direccion: "Medellín, Antioquia",
};

/** Usuarios de la demo. La contraseña es conocida: se le da a quien ve la demostración. */
export const USUARIOS_DEMO = [
  { usuario: "demo", nombre: "Laura (administradora)", rol: "ADMINISTRADOR" as const },
  { usuario: "demo.cajero", nombre: "Mateo (cajero)", rol: "CAJERO" as const },
];
export const CONTRASENA_DEMO = "demo2026";
