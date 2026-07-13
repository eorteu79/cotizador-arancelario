import type { AnalyzeResponse } from "../cotizador/types";

export type Fuente = "base" | "estimado" | "sin_dato";

/** Input original de una cotización en modo texto/url, guardado para que
 * "Retomar" sea exacto. Nula para pdf/foto (no se guarda ese input). */
export interface EntradaOriginal {
  modo: "text" | "url";
  valor: string;
  cif: number;
  moneda: string;
  destino: string;
}

export interface HistorialItem {
  id: string;
  created_at: string;
  producto: string;
  ncm: string | null;
  fuente: Fuente;
  entrada: EntradaOriginal | null;
}

export interface HistorialListResponse {
  items: HistorialItem[];
  limit: number;
  offset: number;
}

/** El AnalyzeResponse tal como se guardó, más la entrada original si la hay
 * (el /analyze en vivo no expone este campo, solo el historial). */
export interface HistorialResultado extends AnalyzeResponse {
  entrada: EntradaOriginal | null;
}

export interface HistorialDetail {
  id: string;
  created_at: string;
  producto: string;
  ncm: string | null;
  fuente: Fuente;
  resultado: HistorialResultado;
}
