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
  iibb_pct: number;
}

export interface Classification {
  ncm: string;
  description: string;
  probability: Probability;
  rationale: string;
  rates: Rates;
  requirements: string[];
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

export type ImporterType = "responsable_inscripto" | "consumidor_final";

export interface CifInputs {
  cif_value: number;
  currency: string;
  importer_type: ImporterType;
  include_percepciones: boolean;
}

export interface AnalyzeResponse {
  needs_clarification: boolean;
  clarification_questions: ClarificationQuestion[];
  product: ProductInfo | null;
  classifications: Classification[];
  cost_breakdown: CostBreakdown | null;
  notes: string[];
  disclaimer: string;
}
