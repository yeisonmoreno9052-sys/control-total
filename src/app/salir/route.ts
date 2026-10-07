import { signOut } from "@/auth";

// Se usa cuando la sesión deja de ser válida (usuario o empresa desactivados).
export async function GET() {
  await signOut({ redirectTo: "/ingresar" });
}
