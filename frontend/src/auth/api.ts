import { API_BASE } from "../lib/apiBase";
import { apiFetch } from "../lib/apiClient";
import { authHeader } from "../lib/authHeader";

/**
 * Pings a protected endpoint right after login so an unauthorized email is
 * caught immediately (apiFetch redirects to /acceso-denegado on 403), instead
 * of waiting for the user to trigger the first module call.
 */
export async function checkAccess(): Promise<void> {
  const auth = await authHeader();
  await apiFetch(`${API_BASE}/auth/whoami`, { headers: auth });
}
