import { supabase } from "../../lib/supabaseClient";
import type {
  AnalyzeResponse,
  CifInputs,
  ClarificationAnswer,
  Mode,
} from "./types";

const MODULE_BASE = "/api/cotizador";

export interface AnalyzeArgs {
  mode: Mode;
  text?: string;
  url?: string;
  file?: File | null;
  cif: CifInputs;
  clarifications: ClarificationAnswer[];
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.detail) return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    return JSON.stringify(j);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
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
    const res = await fetch(`${MODULE_BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  if (!args.file) throw new Error("Falta el archivo a subir.");

  const fd = new FormData();
  fd.append("mode", args.mode);
  fd.append("file", args.file);
  fd.append("cif_json", JSON.stringify(args.cif));
  fd.append("clarifications_json", JSON.stringify(args.clarifications));

  const res = await fetch(`${MODULE_BASE}/analyze/file`, {
    method: "POST",
    headers: auth,
    body: fd,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function health(): Promise<{ ok: boolean; anthropic_key_configured: boolean }> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
