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
