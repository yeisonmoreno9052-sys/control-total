import { Badge } from "@/components/ui/badge";

export function EstadoVenta({ estado }: { estado: string }) {
  if (estado === "ANULADA") return <Badge variant="destructive">Anulada</Badge>;
  if (estado === "CON_DEVOLUCION") return <Badge variant="aviso">Con devolución</Badge>;
  return null;
}
