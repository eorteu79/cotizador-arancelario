import { API_BASE } from "../../lib/apiBase";
import { apiFetch, readErrorDetail } from "../../lib/apiClient";
import { authHeader } from "../../lib/authHeader";
import type {
  AccesoOut,
  OverrideIn,
  OverrideOut,
  PromptStateResponse,
  PromptVersion,
  UsuariosListResponse,
} from "./types";

const BASE = `${API_BASE}/admin`;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await authHeader();
  const res = await apiFetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...auth, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await readErrorDetail(res));
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------- Overrides de aranceles ----------

export function listOverrides(): Promise<{ items: OverrideOut[] }> {
  return req("/overrides");
}

export function getOverride(ncm: string): Promise<OverrideOut> {
  return req(`/overrides/${encodeURIComponent(ncm)}`);
}

export function upsertOverride(ncm: string, body: OverrideIn): Promise<OverrideOut> {
  return req(`/overrides/${encodeURIComponent(ncm)}`, { method: "PUT", body: JSON.stringify(body) });
}

export function deleteOverride(ncm: string): Promise<void> {
  return req(`/overrides/${encodeURIComponent(ncm)}`, { method: "DELETE" });
}

// ---------- Prompt de Gemini ----------

export function getPromptState(): Promise<PromptStateResponse> {
  return req("/prompt");
}

export function createPromptVersion(contenido: string): Promise<PromptVersion> {
  return req("/prompt", { method: "POST", body: JSON.stringify({ contenido }) });
}

export function activarPromptVersion(id: string): Promise<PromptVersion> {
  return req(`/prompt/${encodeURIComponent(id)}/activar`, { method: "POST" });
}

// ---------- Usuarios ----------

export function listUsuarios(page = 1, perPage = 50): Promise<UsuariosListResponse> {
  return req(`/usuarios?page=${page}&per_page=${perPage}`);
}

// ---------- Accesos ----------

export function listAcceso(): Promise<{ items: AccesoOut[] }> {
  return req("/acceso");
}

export function upsertAcceso(email: string, permitido: boolean, nota?: string): Promise<AccesoOut> {
  return req("/acceso", { method: "POST", body: JSON.stringify({ email, permitido, nota: nota ?? null }) });
}

export function deleteAcceso(email: string): Promise<void> {
  return req(`/acceso/${encodeURIComponent(email)}`, { method: "DELETE" });
}

// ---------- Roles ----------

export function asignarRol(email: string, role: "admin" | "superadmin"): Promise<void> {
  return req("/roles", { method: "POST", body: JSON.stringify({ email, role }) });
}

export function quitarRol(email: string): Promise<void> {
  return req(`/roles/${encodeURIComponent(email)}`, { method: "DELETE" });
}
