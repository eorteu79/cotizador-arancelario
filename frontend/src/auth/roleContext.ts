import { createContext } from "react";

export type Role = "superadmin" | "admin" | null;

export interface RoleContextValue {
  /** null mientras carga o si el usuario no tiene rol de administración
   * (usuario común). undefined solo antes del primer fetch. */
  role: Role;
  loading: boolean;
}

export const RoleContext = createContext<RoleContextValue>({ role: null, loading: true });
