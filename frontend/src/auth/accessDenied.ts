import { supabase } from "../lib/supabaseClient";

const STORAGE_KEY = "tw_acceso_pendiente";

interface PendingAccessInfo {
  nombre: string;
  email: string;
}

/**
 * Called whenever the backend rejects an authenticated Supabase session with
 * 403 email_no_autorizado. Captures the user's name/email for the "Solicitar
 * acceso" form, signs them out (so the app doesn't sit half-loaded with a
 * session the backend refuses to honor), and does a full navigation to the
 * dedicated screen — a fresh load, not client-side routing, so no stale
 * component state survives the sign-out.
 */
export async function handleAccessDenied(): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (user) {
    const info: PendingAccessInfo = {
      nombre: (user.user_metadata?.full_name ?? user.user_metadata?.name ?? "") as string,
      email: user.email ?? "",
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  }
  await supabase.auth.signOut();
  window.location.assign("/acceso-denegado");
}

export function readPendingAccessInfo(): PendingAccessInfo | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingAccessInfo;
  } catch {
    return null;
  }
}

export function clearPendingAccessInfo(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
