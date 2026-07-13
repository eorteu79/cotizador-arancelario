export type Mode = "text" | "url" | "pdf" | "image";

export type Probability = "alta" | "media" | "baja";

export interface ClarificationQuestion {
  id: string;
  question: string;
  why: string;
}

export interface ClarificationAnswer {
  id: string;
  answer: string;
}

export interface Rates {
  derecho_importacion_pct: number;
  tasa_estadistica_pct: number;
  iva_pct: number;
  iva_adicional_pct: number;
  ganancias_pct: number;
}

export type RateFieldSource = "base_oficial" | "estimado_ia" | "verificar";

export interface RateSource {
  derecho_importacion: RateFieldSource;
  tasa_estadistica: RateFieldSource;
  iva: RateFieldSource;
  iva_adicional: RateFieldSource;
  ganancias: RateFieldSource;
}

export interface Classification {
  ncm: string;
  description: string;
  probability: Probability;
  rationale: string;
  rates: Rates;
  requirements: string[];
  rates_source: RateSource;
  base_match: boolean;
  nota_base: string | null;
}

export interface ProductInfo {
  identified_name: string;
  summary: string;
  key_attributes: Record<string, string>;
  confidence: Probability;
}

export interface CostBreakdown {
  cif_value: number;
  currency: string;
  derecho_importacion: number;
  tasa_estadistica: number;
  base_iva: number;
  iva: number;
  iva_adicional: number;
  ganancias: number;
  iibb: number;
  costo_mercaderia: number;
  desembolso_aduana_sin_percepciones: number;
  desembolso_aduana_total: number;
  landed_cost: number;
  notas: string[];
}

export type Destino = "bien_cambio" | "bien_uso";

export interface CifInputs {
  cif_value: number;
  currency: string;
  destino: Destino;
  iibb_pct: number;
}

export interface AnalyzeResponse {
  needs_clarification: boolean;
  clarification_questions: ClarificationQuestion[];
  product: ProductInfo | null;
  classifications: Classification[];
  cost_breakdown: CostBreakdown | null;
  notes: string[];
  disclaimer: string;
  vigencia_base: string;
  /** Id de la fila en public.cotizaciones, si el guardado del historial tuvo
   * éxito. Ausente junto con cotizacion_created_at si falló (ver
   * export/filename.ts para el fallback de nombre de archivo). */
  cotizacion_id: string | null;
  cotizacion_created_at: string | null;
}

/** Router `location.state` shape used by the "Retomar" button in /historial to
 * prefill the cotizador with a past query. For text/url cotizaciones the stored
 * "entrada" makes this exact (mode + original value); for pdf/foto (no entrada
 * saved) it falls back to a best-effort text built from the stored result. */
export interface RetomarState {
  retomar: {
    mode?: Mode;
    text?: string;
    url?: string;
    cif?: CifInputs;
  };
}
