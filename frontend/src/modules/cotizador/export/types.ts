import type { Destino } from "../types";

/** Badge de procedencia de un dato: viene de la base arancelaria oficial, es un
 * estimado del modelo, o la base no tiene el dato y también se estima. Mismo
 * mapeo que usa el backend (FUENTE_BY_RATE_SOURCE) para no duplicar criterios. */
export type Fuente = "base" | "estimado" | "sin_dato";

export interface RateCardData {
  key: "di" | "te" | "iva" | "iva_adicional" | "ganancias";
  label: string;
  pct: number;
  color: "navy" | "gold" | "burg";
  fuente: Fuente;
}

export interface DesgloseRow {
  concepto: string;
  sufijo?: string;
  tono: "navy" | "burg" | "tinta";
  baseImponible: number;
  alicuotaPct: number;
  importeUsd: number;
}

/** Contrato de datos ya resueltos (importes tal cual vienen del backend, sin
 * recalcular) que consumen exportPdf/exportXlsx. Se arma tanto desde el
 * resultado en vivo del cotizador como desde una cotización del historial —
 * ver buildExportData(). */
export interface ExportData {
  /** Uuid completo de la fila en public.cotizaciones ("" si el guardado
   * falló) — filename.ts arma el nombre del export a partir de esto, no del
   * NCM. */
  id: string;
  cotizacionNumero: string;
  fechaIso: string;
  email: string;

  productoNombre: string;
  ncm: string;
  fuente: Fuente;

  cifValue: number;
  moneda: string;
  destino: Destino | null;
  destinoLabel: string;
  iibbPct: number | null;

  rateCards: RateCardData[];
  desglose: DesgloseRow[];

  totales: {
    cifValue: number;
    tributosAduaneros: number;
    percepciones: number;
    landedCost: number;
  };

  vigenciaBase: string;
}
