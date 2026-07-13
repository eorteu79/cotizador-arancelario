import { API_BASE } from "../../lib/apiBase";
import { apiFetch, readErrorDetail } from "../../lib/apiClient";
import { authHeader } from "../../lib/authHeader";
import type {
  AnalyzeResponse,
  CifInputs,
  ClarificationAnswer,
  Mode,
} from "./types";

const MODULE_BASE = `${API_BASE}/cotizador`;

export interface AnalyzeArgs {
  mode: Mode;
  text?: string;
  url?: string;
  file?: File | null;
  cif: CifInputs;
  clarifications: ClarificationAnswer[];
}

export async function analyze(args: AnalyzeArgs): Promise<AnalyzeResponse> {
  const auth = await authHeader();

  if (args.mode === "text" || args.mode === "url") {
    const body = {
      mode: args.mode,
      text: args.text,
      url: args.url,
      cif: args.cif,
      clarifications: args.clarifications,
    };
    const res = await apiFetch(`${MODULE_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await readErrorDetail(res));
    return res.json();
  }

  if (!args.file) throw new Error("Falta el archivo a subir.");

  const fd = new FormData();
  fd.append("mode", args.mode);
  fd.append("file", args.file);
  fd.append("cif_json", JSON.stringify(args.cif));
  fd.append("clarifications_json", JSON.stringify(args.clarifications));

  const res = await apiFetch(`${MODULE_BASE}/analyze/file`, {
    method: "POST",
    headers: auth,
    body: fd,
  });
  if (!res.ok) throw new Error(await readErrorDetail(res));
  return res.json();
}

export async function health(): Promise<{ ok: boolean; anthropic_key_configured: boolean }> {
  const res = await apiFetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(await readErrorDetail(res));
  return res.json();
}

/** Fase 5.4 — elegir otro NCM para la cotización (cualquier usuario). El
 * backend hace el lookup oficial (base + overrides), no vuelve a llamar a
 * Gemini, y guarda una fila nueva en el historial. */
export async function reclasificar(args: {
  ncm: string;
  producto: string;
  cif: CifInputs;
}): Promise<AnalyzeResponse> {
  const auth = await authHeader();
  const res = await apiFetch(`${MODULE_BASE}/reclasificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(await readErrorDetail(res));
  return res.json();
}

export type CampoCorregible =
  | "derecho_importacion_pct"
  | "tasa_estadistica_pct"
  | "iva_pct"
  | "iva_adicional_pct"
  | "ganancias_pct";

/** Fase 5.4 — corrección puntual a mano (solo superadmin): sobrescribe un
 * único número SOLO para esta cotización ya guardada en el historial. */
export async function ajusteManual(
  cotizacionId: string,
  campo: CampoCorregible,
  valor: number
): Promise<import("../historial/types").HistorialDetail> {
  const auth = await authHeader();
  const res = await apiFetch(
    `${MODULE_BASE}/historial/${encodeURIComponent(cotizacionId)}/ajuste`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ campo, valor }),
    }
  );
  if (!res.ok) throw new Error(await readErrorDetail(res));
  return res.json();
}
