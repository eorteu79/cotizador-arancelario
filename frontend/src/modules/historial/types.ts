import type { AnalyzeResponse } from "../cotizador/types";

export type Fuente = "base" | "estimado" | "sin_dato";

export interface HistorialItem {
  id: string;
  created_at: string;
  producto: string;
  ncm: string | null;
  fuente: Fuente;
}

export interface HistorialListResponse {
  items: HistorialItem[];
  limit: number;
  offset: number;
}

export interface HistorialDetail extends HistorialItem {
  resultado: AnalyzeResponse;
}
