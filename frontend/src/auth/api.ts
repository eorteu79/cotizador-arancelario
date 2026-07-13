import { API_BASE } from "../lib/apiBase";
import { apiFetch, readErrorDetail } from "../lib/apiClient";
import { authHeader } from "../lib/authHeader";
import type { Role } from "./roleContext";

/**
 * Pings a protected endpoint right after login so an unauthorized email is
 * caught immediately (apiFetch redirects to /acceso-denegado on 403), instead
 * of waiting for the user to trigger the first module call.
 */
export async function checkAccess(): Promise<void> {
  const auth = await authHeader();
  await apiFetch(`${API_BASE}/auth/whoami`, { headers: auth });
}

/** Rol de administración del usuario logueado (fase 5.4): 'superadmin' |
 * 'admin' | null (usuario común, sin acceso a /admin). */
export async function getMyRole(): Promise<Role> {
  const auth = await authHeader();
  const res = await apiFetch(`${API_BASE}/me/rol`, { headers: auth });
  if (!res.ok) throw new Error(await readErrorDetail(res));
  const data = (await res.json()) as { role: Role };
  return data.role;
}
