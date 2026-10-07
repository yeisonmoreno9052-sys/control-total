# Control Total — sistema de inventario y ventas de EMY TELECOM

> Este archivo va en la raíz del repositorio. Claude Code lo lee al iniciar cada sesión.
> Nombre comercial del producto: **Control Total**.

## 1. Qué estamos construyendo

Un sistema web de punto de venta, inventario, proveedores y control de caja para comercios pequeños en Colombia. Lo desarrolla y lo vende **EMY TELECOM** (Medellín, NIT 901922154).

- **Primera clienta:** Camila. Tiene un almacén de repuestos de moto (propio) y va a abrir una ferretería en sociedad con otra persona. Son dos locales separados que se manejan desde la misma aplicación.
- **Meta de negocio:** que este mismo sistema se le pueda vender a muchos comercios más sin reescribir nada. Por eso es **multiempresa desde el día uno**: dar de alta un cliente nuevo debe ser crear una empresa, sus negocios y sus usuarios, no desplegar otra copia.
- **Modelo de cobro:** pago de entrada + mensualidad por empresa.

### Realidad de la primera clienta (requisitos levantados)

- Hoy registra en cuaderno; tiene un inventario desactualizado en el programa "Abarrotes Punto de Venta" (evaluar si se puede exportar para importarlo).
- Repuestos de moto: unos 20.000 productos, la mayoría con código de barras. La ferretería arrancará con 10.000–20.000.
- **La ferretería abre a mediados de octubre de 2026**: inventario y caja deben estar usables primero; lo demás puede llegar después.
- La ferretería vende fraccionado: metros, kilos, granel.
- Lo que más desorden le genera: los tornillos y los productos de segunda, cuyo costo cambia en cada compra.
- Ventas en efectivo y transferencia. No fía. Hace descuentos. Pocas devoluciones, pero existen. Recibo impreso o por WhatsApp, opcional.
- Quiere empezar a hacer cierre de caja diario.
- Unos 10 proveedores fijos en motos, casi siempre de contado; quiere controlar deudas y vencimientos. Los proveedores de la ferretería son otros y no se comparten.
- No tiene regla clara para fijar precios de venta: el sistema debe sugerir precio a partir de un margen.
- 2 o 3 cajeros por local.
- Reportes diarios, semanales y mensuales, detallados y exportables. Necesita un reporte de utilidades de la ferretería para repartir con el socio. Gasto principal a registrar: nómina.
- El local tiene PC, impresora, lector de código de barras e internet estable.

## 2. Principios que no se negocian

1. **Elegante y simple.** Lo va a usar gente que no es técnica, en un mostrador, con clientes esperando. Menos pantallas, menos clics, letras grandes, cero jerga.
2. **Rápido en caja.** Registrar una venta común debe tomar segundos: buscar o escanear, cantidad, cobrar.
3. **Los datos de una empresa jamás se cruzan con los de otra**, ni los de un negocio con los de otro cuando el usuario no tiene permiso.
4. **Una venta registrada no se edita ni se borra:** se anula con otro registro, dejando rastro de quién y cuándo. (Necesario para facturación electrónica más adelante.)
5. **Todo en español de Colombia.** Moneda COP sin decimales, formato `$ 1.250.000`, fechas `dd/mm/aaaa`, zona horaria `America/Bogota`.

## 3. Stack

| Capa | Elección |
|---|---|
| Aplicación | Next.js (App Router) + TypeScript |
| Interfaz | Tailwind CSS + shadcn/ui |
| Base de datos | PostgreSQL |
| ORM | Prisma (con migraciones versionadas) |
| Autenticación | Auth.js con usuario y contraseña (hash con argon2 o bcrypt) |
| Validación | Zod, en servidor siempre |
| Alojamiento | Railway (app + Postgres). Debe poder migrarse a DigitalOcean sin cambios de código: toda la configuración por variables de entorno |
| Dispositivos | PC de escritorio (posible pantalla táctil en caja) e iPhone. Web responsive instalable como PWA; no hay app nativa |

Si Claude Code considera que una pieza del stack no conviene, debe decirlo y esperar aprobación antes de cambiarla.

## 4. Modelo de datos (base)

Jerarquía: **Empresa → Negocio → todo lo demás.**

- **Empresa**: el cliente de EMY TELECOM (ej. "Camila"). Nombre, NIT, datos de contacto, estado de la suscripción y **módulos activos** (inventario, ventas, proveedores, caja y reportes hoy; a futuro órdenes de trabajo, mesas, etc.). Un módulo apagado no aparece en menús ni responde en el servidor.
- **Negocio**: cada local dentro de la empresa (ej. "Repuestos de moto", "Ferretería"). Nombre, dirección, tipo.
- **Usuario**: pertenece a una empresa. Rol + lista de negocios a los que tiene acceso.
- **Producto**: código/referencia, código de barras, nombre/descripción, categoría, precio de costo, precio de venta, cantidad en stock, **unidad de medida** (unidad, metro, kilo, gramo, litro…), si admite venta fraccionada, negocio al que pertenece, stock mínimo, porcentaje de IVA, condición (nuevo / de segunda), activo/inactivo.
  - Las cantidades (stock, venta, compra) son decimales con hasta 3 cifras; los productos por unidad solo aceptan enteros.
  - El costo se lleva como **promedio ponderado** que se recalcula con cada compra. En productos de segunda, cada compra pide confirmar el costo y el precio de venta.
  - Margen sugerido configurable por negocio y por categoría: al cambiar el costo, el sistema propone precio de venta.
- **Categoría**: por negocio.
- **MovimientoInventario**: toda entrada o salida de stock (compra, venta, ajuste, anulación) con cantidad, motivo, usuario y fecha. El stock se explica siempre por sus movimientos.
- **Venta** y **DetalleVenta**: negocio, cajero, cliente (opcional), consecutivo por negocio, subtotal, impuestos, descuento, total, medio de pago (efectivo, transferencia o mixto; dejar la lista ampliable para tarjeta), estado (registrada / anulada / con devolución). No hay ventas a crédito. Las devoluciones parciales se registran como un documento aparte ligado a la venta. El detalle guarda el precio y el costo **del momento de la venta**.
- **Cliente** (opcional en la venta): tipo y número de documento, nombre, teléfono, correo, dirección.
- **Proveedor**: NIT, nombre, contacto, teléfono. Pertenece a un negocio; no se comparte entre negocios.
- **FacturaCompra** y **DetalleFacturaCompra**: proveedor, número de factura, fecha, productos, cantidades, costos, total, estado de pago (pagada / pendiente / abono parcial), fecha de vencimiento.
- **MovimientoCaja**: ingresos y egresos que no son ventas (arriendo, servicios, nómina, retiros), con categoría y negocio.
- **Auditoría**: quién hizo qué y cuándo en acciones sensibles (anular venta, ajustar stock, cambiar precios, cambiar permisos).

Reglas técnicas:
- Toda tabla de negocio lleva `empresaId` (y `negocioId` cuando aplica). Toda consulta filtra por la empresa de la sesión. Esto se resuelve en una sola capa de acceso a datos, no repitiendo el filtro a mano en cada pantalla.
- Dinero en enteros (pesos), nunca en `float`.
- Borrado lógico (activo/inactivo), no borrado físico, en productos, clientes, proveedores y usuarios.

## 5. Roles y permisos

| Rol | Qué puede hacer |
|---|---|
| **Administrador** (Camila) | Todo, en todos los negocios de su empresa. Crea usuarios y asigna negocios. |
| **Socio** | Todo lo de un administrador, pero **solo en los negocios asignados** (el socio de la ferretería no ve nada del negocio de motos: ni productos, ni ventas, ni cifras, ni el nombre en los menús). |
| **Cajero / vendedor** | Registra ventas, da descuentos, anula ventas (con motivo, queda en auditoría) y consulta inventario de su negocio. **Sin acceso** a ingresos, egresos, costos, utilidades ni reportes financieros. No ve precio de costo. |
| **Superadmin EMY TELECOM** | Panel interno para crear empresas, activar/suspender suscripciones y dar soporte. |

El modelo de datos soporta roles desde el inicio; las pantallas de gestión de usuarios y el endurecimiento de permisos se construyen en la fase 5. Los permisos se validan **en el servidor**, no solo ocultando botones.

## 6. Preparado para facturación electrónica (DIAN)

No se implementa ahora (la clienta la quiere en 2–3 años), pero el diseño no debe estorbarla:

- Cliente con tipo y número de documento.
- IVA por producto y totales de impuestos guardados por línea y por venta.
- Consecutivo de venta por negocio, sin huecos ni repeticiones.
- Ventas inmutables; correcciones mediante anulación (equivalente futuro a nota crédito).
- Datos fiscales del negocio (NIT, razón social, dirección, régimen) en su propia configuración.
- Campos reservados en la venta para el documento electrónico (estado, identificador y respuesta del proveedor), vacíos por ahora.
- La futura integración se hará contra la API de un proveedor tecnológico, aislada en un módulo propio (`/lib/facturacion`) detrás de una interfaz, para poder cambiar de proveedor.

## 7. Diseño visual

- **Marca:** azul y gris (colores de EMY TELECOM). Los valores exactos salen del manual de identidad en PDF; mientras no estén cargados, definir los colores como tokens en un solo archivo de tema para cambiarlos en un minuto.
- Estilo sobrio y limpio: mucho espacio en blanco, una sola tipografía, bordes suaves, sin degradados llamativos ni adornos.
- Modo claro por defecto; modo oscuro opcional.
- Botones y campos grandes en la pantalla de venta (pensada para dedo en pantalla táctil).
- Cada pantalla debe verse bien a 375 px de ancho (iPhone) y en monitor de escritorio.
- Estados vacíos con una frase y un botón de acción, no pantallas en blanco.
- Mensajes de error en lenguaje humano ("No hay suficiente stock de este producto"), nunca códigos.
- Cada empresa puede subir su logo; aparece en el encabezado y en los recibos. En el pie: "Desarrollado por EMY TELECOM".

## 8. Fases de construcción

Se trabaja **una fase a la vez**. No empezar la siguiente sin aprobación.

**Prioridad por fecha:** la ferretería abre a mediados de octubre de 2026. Las fases 0, 1 y 2 más un despliegue básico en Railway (adelantado de la fase 6, con copias de seguridad) son lo mínimo para operar. El resto se construye con el sistema ya en uso.

**Rendimiento:** listas, búsqueda e importación deben funcionar con fluidez con 40.000 productos (paginación y búsqueda en servidor, índices en código, código de barras y nombre).

0. **Base:** proyecto, base de datos, inicio de sesión, estructura empresa/negocio, tema visual, menú y selector de negocio.
1. **Inventario:** productos, categorías, búsqueda, importación desde Excel/CSV, ajustes de stock, alerta de stock mínimo.
2. **Ventas:** pantalla de caja, medios de pago, recibo imprimible/compartible, anulación, historial.
3. **Proveedores y facturas de compra:** proveedores, registro de facturas (que suben stock y actualizan costo), cuentas por pagar.
4. **Caja y reportes:** ingresos y egresos, cierre de caja diario, reportes de ventas, utilidad, productos más vendidos, inventario valorizado.
5. **Usuarios y permisos:** gestión de usuarios, asignación de negocios, revisión completa de permisos en servidor, auditoría.
6. **Salida a producción:** PWA, despliegue en Railway, copias de seguridad automáticas, dominio, datos reales de Camila.
7. **Listo para vender:** panel superadmin, empresa de demostración con datos de ejemplo, página de presentación.

## 9. Forma de trabajar con Claude Code

- Antes de escribir código en una fase: presentar un plan corto y esperar el visto bueno.
- Commits pequeños con mensajes claros en español.
- Cada cambio de base de datos es una migración de Prisma; nunca modificar la base a mano.
- Pruebas automáticas obligatorias para: cálculo de totales e impuestos, movimientos de stock, consecutivos, y aislamiento entre empresas y entre negocios.
- Al cerrar cada fase: correr pruebas, levantar la app, verificar el flujo completo y entregar un resumen de qué quedó, qué falta y cómo probarlo.
- Explicar las decisiones en lenguaje sencillo: el dueño del proyecto está aprendiendo a desarrollar.
- Nunca subir contraseñas ni claves al repositorio; usar `.env` y dejar un `.env.example`.
- Si algo del pedido es ambiguo o hay dos caminos razonables, preguntar antes de asumir.
