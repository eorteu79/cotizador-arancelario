import { handleAccessDenied } from "../auth/accessDenied";

/** Thrown after a 403 email_no_autorizado has already been handled (sign-out +
 * redirect underway) — callers don't need to show their own error for this. */
export class AccessDeniedError extends Error {
  constructor() {
    super("email_no_autorizado");
    this.name = "AccessDeniedError";
  }
}

/**
 * Thin wrapper around fetch used by every module's API layer. Centralizes
 * detection of the backend's 403 email_no_autorizado response so any endpoint
 * that returns it triggers the same sign-out + "Solicitar acceso" flow,
 * instead of each caller having to special-case it.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);

  if (res.status === 403) {
    let detail: unknown;
    try {
      detail = (await res.clone().json())?.detail;
    } catch {
      detail = undefined;
    }
    if (detail === "email_no_autorizado") {
      await handleAccessDenied();
      throw new AccessDeniedError();
    }
  }

  return res;
}

/** Extracts a readable message from a FastAPI-style {"detail": ...} error body. */
export async function readErrorDetail(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.detail) return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    return JSON.stringify(j);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}
