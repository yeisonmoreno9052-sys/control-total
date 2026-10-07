// La única puerta a la base de datos para el resto de la app.
//
// datosDe(contexto) devuelve un cliente de Prisma que, en CADA consulta:
//   1. filtra por la empresa del usuario (nunca ve datos de otra empresa),
//   2. filtra por los negocios a los que el usuario tiene acceso,
//   3. al crear registros, les pone la empresa del usuario.
//
// Si un modelo no está registrado en MODELOS, la consulta falla. Así, cuando
// agreguemos tablas nuevas (productos, ventas…) no pueden quedar sin filtro
// por olvido: hay que registrarlas aquí.
import type { Contexto } from "./contexto";
import { prisma } from "./cliente";

export class AccesoDenegado extends Error {
  constructor(detalle: string) {
    super(`Acceso denegado: ${detalle}`);
    this.name = "AccesoDenegado";
  }
}

type Donde = Record<string, unknown>;

type ReglaModelo = {
  /** Condición que se agrega a toda consulta del modelo. */
  filtro: (ctx: Contexto) => Donde;
  /** Campos que se fuerzan al crear. null = el modelo no se puede crear desde la app. */
  alCrear: ((ctx: Contexto) => Donde) | null;
  /**
   * Relaciones del modelo. No se permite traerlas con include/select ni
   * escribirlas anidadas, porque Prisma no aplica nuestro filtro dentro de
   * ellas. Se consultan aparte, cada una con su propio filtro.
   */
  relaciones: string[];
  /** El modelo tiene negocioId: al crear o editar debe ser un negocio permitido. */
  porNegocio?: boolean;
  /** Desde la app solo se lee (historiales que no se pueden alterar). */
  soloLectura?: boolean;
  /** Se permite borrar de verdad. Por defecto no: se usa borrado lógico (activo = false). */
  borrable?: boolean;
};

const deEmpresa = (ctx: Contexto) => ({ empresaId: ctx.empresaId });
const deNegocios = (ctx: Contexto) => ({
  empresaId: ctx.empresaId,
  negocioId: { in: ctx.negociosPermitidos },
});

const MODELOS: Record<string, ReglaModelo> = {
  Empresa: {
    filtro: (ctx) => ({ id: ctx.empresaId }),
    alCrear: null,
    relaciones: [
      "negocios", "usuarios", "usuarioNegocios", "categorias", "productos", "movimientos", "auditorias",
      "clientes", "cajas", "ventas", "detallesVenta", "pagosVenta", "devoluciones", "detallesDevolucion",
    ],
  },
  Negocio: {
    filtro: (ctx) => ({ empresaId: ctx.empresaId, id: { in: ctx.negociosPermitidos } }),
    alCrear: deEmpresa,
    relaciones: [
      "empresa", "usuarios", "categorias", "productos", "movimientos", "auditorias",
      "clientes", "cajas", "ventas", "detallesVenta", "pagosVenta", "devoluciones", "detallesDevolucion",
    ],
  },
  Usuario: {
    filtro: deEmpresa,
    alCrear: deEmpresa,
    relaciones: [
      "empresa", "negocios", "movimientos", "auditorias",
      "ventas", "ventasAnuladas", "devoluciones", "cajasAbiertas", "cajasCerradas",
    ],
  },
  UsuarioNegocio: {
    filtro: deNegocios,
    alCrear: deEmpresa,
    relaciones: ["empresa", "usuario", "negocio"],
    porNegocio: true,
    borrable: true,
  },
  Categoria: {
    filtro: deNegocios,
    alCrear: deEmpresa,
    relaciones: ["empresa", "negocio", "productos"],
    porNegocio: true,
  },
  Producto: {
    filtro: deNegocios,
    alCrear: deEmpresa,
    relaciones: ["empresa", "negocio", "categoria", "movimientos", "detallesVenta", "detallesDevolucion"],
    porNegocio: true,
  },
  // Los movimientos y la auditoría solo se escriben desde inventario.ts,
  // dentro de una transacción; desde la app solo se leen.
  MovimientoInventario: {
    filtro: deNegocios,
    alCrear: null,
    relaciones: ["empresa", "negocio", "producto", "usuario"],
    porNegocio: true,
    soloLectura: true,
  },
  Cliente: {
    filtro: deNegocios,
    alCrear: deEmpresa,
    relaciones: ["empresa", "negocio", "ventas"],
    porNegocio: true,
  },
  // Cajas, ventas y devoluciones solo se escriben desde ventas.ts y caja.ts,
  // dentro de una transacción; desde la app solo se leen.
  Caja: {
    filtro: deNegocios,
    alCrear: null,
    relaciones: ["empresa", "negocio", "abiertaPor", "cerradaPor", "ventas", "anulaciones", "devoluciones"],
    porNegocio: true,
    soloLectura: true,
  },
  Venta: {
    filtro: deNegocios,
    alCrear: null,
    relaciones: ["empresa", "negocio", "caja", "usuario", "cliente", "anuladaPor", "anuladaEnCaja", "detalles", "pagos", "devoluciones"],
    porNegocio: true,
    soloLectura: true,
  },
  DetalleVenta: {
    filtro: deNegocios,
    alCrear: null,
    relaciones: ["empresa", "negocio", "venta", "producto", "devueltos"],
    porNegocio: true,
    soloLectura: true,
  },
  PagoVenta: {
    filtro: deNegocios,
    alCrear: null,
    relaciones: ["empresa", "negocio", "venta"],
    porNegocio: true,
    soloLectura: true,
  },
  Devolucion: {
    filtro: deNegocios,
    alCrear: null,
    relaciones: ["empresa", "negocio", "venta", "caja", "usuario", "detalles"],
    porNegocio: true,
    soloLectura: true,
  },
  DetalleDevolucion: {
    filtro: deNegocios,
    alCrear: null,
    relaciones: ["empresa", "negocio", "devolucion", "detalleVenta", "producto"],
    porNegocio: true,
    soloLectura: true,
  },
  Auditoria: {
    filtro: (ctx) => ({
      empresaId: ctx.empresaId,
      OR: [{ negocioId: null }, { negocioId: { in: ctx.negociosPermitidos } }],
    }),
    alCrear: null,
    relaciones: ["empresa", "negocio", "usuario"],
    soloLectura: true,
  },
};

const DE_LECTURA = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "delete",
  "deleteMany",
]);
const DE_EDICION = new Set(["update", "updateMany", "updateManyAndReturn"]);
const DE_CREACION = new Set(["create", "createMany", "createManyAndReturn"]);

function agregarFiltro(where: Donde | undefined, filtro: Donde): Donde {
  const actual = where ?? {};
  const and = actual.AND === undefined ? [] : Array.isArray(actual.AND) ? actual.AND : [actual.AND];
  return { ...actual, AND: [...and, filtro] };
}

function revisarRelaciones(modelo: string, regla: ReglaModelo, args: Donde) {
  if (args.include) {
    throw new AccesoDenegado(`no se permite "include" en ${modelo}; consulta la relación por separado`);
  }
  const campos = [args.select, args.omit, args.data, args.create, args.update];
  for (const objeto of campos) {
    const lista = Array.isArray(objeto) ? objeto : [objeto];
    for (const item of lista) {
      if (!item || typeof item !== "object") continue;
      for (const clave of Object.keys(item)) {
        if (clave === "_count" || regla.relaciones.includes(clave)) {
          throw new AccesoDenegado(`no se permite usar la relación "${clave}" de ${modelo} aquí`);
        }
      }
    }
  }
}

/**
 * Prepara los datos a escribir: fuerza la empresa del usuario (así nadie puede
 * crear ni mover un registro a otra empresa) y revisa que el negocio sea uno
 * de los permitidos.
 */
function prepararDatos(ctx: Contexto, modelo: string, regla: ReglaModelo, data: unknown) {
  const lista = (Array.isArray(data) ? data : [data]) as Donde[];
  const forzados = regla.alCrear ? regla.alCrear(ctx) : {};
  const resultado = lista.map((d) => {
    if (!regla.alCrear && d && "id" in d) {
      throw new AccesoDenegado(`no se puede cambiar el id de ${modelo}`);
    }
    if (regla.porNegocio && d && "negocioId" in d) {
      const negocioId = d.negocioId;
      if (typeof negocioId !== "string" || !ctx.negociosPermitidos.includes(negocioId)) {
        throw new AccesoDenegado(`no tienes acceso a ese negocio`);
      }
    }
    return { ...d, ...forzados };
  });
  return Array.isArray(data) ? resultado : resultado[0];
}

function exigirNegocio(modelo: string, regla: ReglaModelo, data: unknown) {
  if (!regla.porNegocio) return;
  const lista = (Array.isArray(data) ? data : [data]) as Donde[];
  if (lista.some((d) => !d || typeof d.negocioId !== "string")) {
    throw new AccesoDenegado(`${modelo} necesita un negocio`);
  }
}

/** Cliente de base de datos limitado a lo que el usuario del contexto puede ver. */
export function datosDe(ctx: Contexto) {
  if (!ctx?.empresaId) throw new AccesoDenegado("no hay empresa en la sesión");

  return prisma.$extends({
    name: "alcance-empresa-negocio",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const regla = MODELOS[model];
          if (!regla) throw new AccesoDenegado(`el modelo ${model} no tiene reglas de acceso`);

          const esBorrado = operation === "delete" || operation === "deleteMany";
          if (esBorrado && !regla.borrable) {
            throw new AccesoDenegado(`${model} no se borra; se desactiva`);
          }
          if (regla.soloLectura && !DE_LECTURA.has(operation)) {
            throw new AccesoDenegado(`${model} es de solo lectura`);
          }

          const a = { ...(args as Donde) };
          revisarRelaciones(model, regla, a);
          const filtro = regla.filtro(ctx);

          if (DE_LECTURA.has(operation)) {
            a.where = agregarFiltro(a.where as Donde | undefined, filtro);
          } else if (DE_EDICION.has(operation)) {
            a.where = agregarFiltro(a.where as Donde | undefined, filtro);
            a.data = prepararDatos(ctx, model, regla, a.data);
          } else if (DE_CREACION.has(operation)) {
            if (!regla.alCrear) throw new AccesoDenegado(`no se puede crear ${model} desde aquí`);
            exigirNegocio(model, regla, a.data);
            a.data = prepararDatos(ctx, model, regla, a.data);
          } else if (operation === "upsert") {
            if (!regla.alCrear) throw new AccesoDenegado(`no se puede crear ${model} desde aquí`);
            exigirNegocio(model, regla, a.create);
            a.where = agregarFiltro(a.where as Donde | undefined, filtro);
            a.create = prepararDatos(ctx, model, regla, a.create);
            a.update = prepararDatos(ctx, model, regla, a.update);
          } else {
            throw new AccesoDenegado(`la operación ${operation} no está permitida`);
          }

          return query(a as typeof args);
        },
      },
    },
  });
}

export type Datos = ReturnType<typeof datosDe>;
