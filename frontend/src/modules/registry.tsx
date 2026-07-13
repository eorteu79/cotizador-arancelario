import type { ReactNode } from "react";
import type { Role } from "../auth/roleContext";
import AdminPage from "./admin/AdminPage";
import CotizadorPage from "./cotizador/CotizadorPage";
import HistorialPage from "./historial/HistorialPage";

export interface ModuleDef {
  /** Route path, also used as the nav link target. */
  path: string;
  /** Label shown in the shell nav bar. */
  label: string;
  element: ReactNode;
  /** Si está seteado, el módulo solo aparece en el nav (y su ruta solo se
   * habilita) para usuarios con ese rol o superior. Ausente = visible para
   * cualquier usuario autenticado. */
  minRole?: "admin" | "superadmin";
}

/**
 * Every module the shell knows about. To add a new module (e.g. Proveedores):
 * build it under src/modules/<nombre>/, then add one entry here — the shell
 * nav and the router pick it up automatically.
 */
export const modules: ModuleDef[] = [
  { path: "/cotizador", label: "Cotizador", element: <CotizadorPage /> },
  { path: "/historial", label: "Historial", element: <HistorialPage /> },
  { path: "/admin", label: "Admin", element: <AdminPage />, minRole: "admin" },
];

/** true si `role` alcanza el `minRole` de un módulo (sin minRole = público
 * para cualquier usuario autenticado). superadmin siempre alcanza admin. */
export function isModuleVisible(m: ModuleDef, role: Role): boolean {
  if (!m.minRole) return true;
  if (role === "superadmin") return true;
  return role === m.minRole;
}
