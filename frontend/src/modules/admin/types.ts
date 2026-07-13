export interface OverrideIn {
  die_aec: number | null;
  tasa_estadistica: number | null;
  iva: number | null;
  iva_reducido: boolean | null;
  nota: string | null;
  vigencia: string | null;
}

export interface OverrideOut extends OverrideIn {
  ncm: string;
  editado_por: string | null;
  updated_at: string | null;
}

export interface PromptVersion {
  id: string;
  version: number;
  contenido: string;
  activo: boolean;
  created_by: string | null;
  created_at: string;
}

export interface PromptStateResponse {
  activo: PromptVersion;
  versiones: PromptVersion[];
}

export interface UsuarioOut {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  role: "superadmin" | "admin" | null;
}

export interface UsuariosListResponse {
  items: UsuarioOut[];
  page: number;
  per_page: number;
}

export interface AccesoOut {
  email: string;
  permitido: boolean;
  nota: string | null;
  creado_por: string | null;
  created_at: string | null;
}
