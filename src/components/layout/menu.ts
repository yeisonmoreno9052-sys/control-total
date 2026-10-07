import {
  BarChart3,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Modulo, Rol } from "@/generated/prisma/enums";

export type OpcionMenu = {
  titulo: string;
  href: string;
  icono: LucideIcon;
  /** Módulo que debe estar activo. null = siempre visible. */
  modulo: Modulo | null;
  roles: Rol[];
  /** false mientras la pantalla no exista (se muestra como "Pronto"). */
  disponible: boolean;
  /** Si aparece en la barra inferior del celular (máximo 5). */
  enCelular: boolean;
};

const TODOS: Rol[] = ["ADMINISTRADOR", "SOCIO", "CAJERO"];
const GESTION: Rol[] = ["ADMINISTRADOR", "SOCIO"];

export const OPCIONES_MENU: OpcionMenu[] = [
  { titulo: "Inicio", href: "/panel", icono: LayoutDashboard, modulo: null, roles: TODOS, disponible: true, enCelular: true },
  { titulo: "Ventas", href: "/ventas", icono: ShoppingCart, modulo: "VENTAS", roles: TODOS, disponible: true, enCelular: true },
  { titulo: "Inventario", href: "/inventario", icono: Package, modulo: "INVENTARIO", roles: TODOS, disponible: true, enCelular: true },
  { titulo: "Proveedores", href: "/proveedores", icono: Truck, modulo: "PROVEEDORES", roles: GESTION, disponible: false, enCelular: false },
  { titulo: "Caja", href: "/caja", icono: Wallet, modulo: "CAJA", roles: GESTION, disponible: false, enCelular: true },
  { titulo: "Reportes", href: "/reportes", icono: BarChart3, modulo: "REPORTES", roles: GESTION, disponible: false, enCelular: true },
];

export function opcionesPara(rol: Rol, modulos: Modulo[]) {
  return OPCIONES_MENU.filter(
    (o) => o.roles.includes(rol) && (o.modulo === null || modulos.includes(o.modulo)),
  );
}
