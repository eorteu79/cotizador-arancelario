import type { ReactNode } from "react";
import CotizadorPage from "./cotizador/CotizadorPage";
import HistorialPage from "./historial/HistorialPage";

export interface ModuleDef {
  /** Route path, also used as the nav link target. */
  path: string;
  /** Label shown in the shell nav bar. */
  label: string;
  element: ReactNode;
}

/**
 * Every module the shell knows about. To add a new module (e.g. Proveedores):
 * build it under src/modules/<nombre>/, then add one entry here — the shell
 * nav and the router pick it up automatically.
 */
export const modules: ModuleDef[] = [
  { path: "/cotizador", label: "Cotizador", element: <CotizadorPage /> },
  { path: "/historial", label: "Historial", element: <HistorialPage /> },
];
