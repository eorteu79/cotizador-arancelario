import { API_BASE } from "../../lib/apiBase";
import { apiFetch, readErrorDetail } from "../../lib/apiClient";
import { authHeader } from "../../lib/authHeader";
import type { HistorialDetail, HistorialListResponse } from "./types";

const MODULE_BASE = `${API_BASE}/cotizador/historial`;

export async function listHistorial(
  limit = 50,
  offset = 0
): Promise<HistorialListResponse> {
  const auth = await authHeader();
  const res = await apiFetch(`${MODULE_BASE}?limit=${limit}&offset=${offset}`, {
    headers: auth,
  });
  if (!res.ok) throw new Error(await readErrorDetail(res));
  return res.json();
}

export async function getHistorialDetail(id: string): Promise<HistorialDetail> {
  const auth = await authHeader();
  const res = await apiFetch(`${MODULE_BASE}/${encodeURIComponent(id)}`, { headers: auth });
  if (!res.ok) throw new Error(await readErrorDetail(res));
  return res.json();
}
