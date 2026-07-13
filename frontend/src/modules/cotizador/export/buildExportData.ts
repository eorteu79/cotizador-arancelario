import type { HistorialDetail } from "../../historial/types";
import type { AnalyzeResponse, CifInputs, Classification, CostBreakdown, RateFieldSource } from "../types";
import type { DesgloseRow, ExportData, Fuente, RateCardData } from "./types";

/** Mismo criterio que el backend (router.py FUENTE_BY_RATE_SOURCE) para no
 * divergir sobre qué badge mostrar. */
const FUENTE_BY_RATE_SOURCE: Record<RateFieldSource, Fuente> = {
  base_oficial: "base",
  verificar: "sin_dato",
  estimado_ia: "estimado",
};

const DESTINO_LABEL: Record<string, string> = {
  bien_cambio: "Bien de cambio",
  bien_uso: "Bien de uso",
};

interface LiveSource {
  kind: "live";
  result: AnalyzeResponse;
  cif: CifInputs;
  email: string;
}

interface HistorialSource {
  kind: "historial";
  detail: HistorialDetail;
  email: string;
}

export type ExportDataSource = LiveSource | HistorialSource;

function rateCards(primary: Classification): RateCardData[] {
  return [
    {
      key: "di",
      label: "DI",
      pct: primary.rates.derecho_importacion_pct,
      color: "navy",
      fuente: FUENTE_BY_RATE_SOURCE[primary.rates_source.derecho_importacion],
    },
    {
      key: "te",
      label: "Tasa Estad.",
      pct: primary.rates.tasa_estadistica_pct,
      color: "gold",
      fuente: FUENTE_BY_RATE_SOURCE[primary.rates_source.tasa_estadistica],
    },
    {
      key: "iva",
      label: "IVA",
      pct: primary.rates.iva_pct,
      color: "burg",
      fuente: FUENTE_BY_RATE_SOURCE[primary.rates_source.iva],
    },
    {
      key: "iva_adicional",
      label: "IVA Adic.",
      pct: primary.rates.iva_adicional_pct,
      color: "navy",
      fuente: FUENTE_BY_RATE_SOURCE[primary.rates_source.iva_adicional],
    },
    {
      key: "ganancias",
      label: "Ganancias",
      pct: primary.rates.ganancias_pct,
      color: "gold",
      fuente: FUENTE_BY_RATE_SOURCE[primary.rates_source.ganancias],
    },
  ];
}

function desglose(b: CostBreakdown, iibbPct: number | null): DesgloseRow[] {
  const rows: DesgloseRow[] = [
    {
      concepto: "Derecho de Importación (DIE)",
      tono: "navy",
      baseImponible: b.cif_value,
      alicuotaPct: b.cif_value > 0 ? (b.derecho_importacion / b.cif_value) * 100 : 0,
      importeUsd: b.derecho_importacion,
    },
    {
      concepto: "Tasa de Estadística",
      tono: "tinta",
      baseImponible: b.cif_value,
      alicuotaPct: b.cif_value > 0 ? (b.tasa_estadistica / b.cif_value) * 100 : 0,
      importeUsd: b.tasa_estadistica,
    },
    {
      concepto: "IVA",
      sufijo: "s/ base CIF + DIE + tasa",
      tono: "burg",
      baseImponible: b.base_iva,
      alicuotaPct: b.base_iva > 0 ? (b.iva / b.base_iva) * 100 : 0,
      importeUsd: b.iva,
    },
    {
      concepto: "Percepción IVA",
      sufijo: "RG 2937",
      tono: "tinta",
      baseImponible: b.base_iva,
      alicuotaPct: b.base_iva > 0 ? (b.iva_adicional / b.base_iva) * 100 : 0,
      importeUsd: b.iva_adicional,
    },
    {
      concepto: "Percepción Ganancias",
      tono: "tinta",
      baseImponible: b.base_iva,
      alicuotaPct: b.base_iva > 0 ? (b.ganancias / b.base_iva) * 100 : 0,
      importeUsd: b.ganancias,
    },
  ];
  if (b.iibb > 0 || iibbPct !== null) {
    rows.push({
      concepto: "Percepción IIBB",
      tono: "tinta",
      baseImponible: b.base_iva,
      alicuotaPct: iibbPct ?? (b.base_iva > 0 ? (b.iibb / b.base_iva) * 100 : 0),
      importeUsd: b.iibb,
    });
  }
  return rows;
}

function fromParts(
  primary: Classification,
  b: CostBreakdown,
  productoNombre: string,
  fuente: Fuente,
  destino: CifInputs["destino"] | null,
  iibbPct: number | null,
  cotizacionNumero: string,
  fechaIso: string,
  email: string,
  vigenciaBase: string
): ExportData {
  const tributosAduaneros = b.derecho_importacion + b.tasa_estadistica + b.iva;
  const percepciones = b.iva_adicional + b.ganancias + b.iibb;
  return {
    cotizacionNumero,
    fechaIso,
    email,
    productoNombre,
    ncm: primary.ncm,
    fuente,
    cifValue: b.cif_value,
    moneda: b.currency,
    destino: destino ?? null,
    destinoLabel: destino ? DESTINO_LABEL[destino] ?? destino : "—",
    iibbPct,
    rateCards: rateCards(primary),
    desglose: desglose(b, iibbPct),
    totales: {
      cifValue: b.cif_value,
      tributosAduaneros,
      percepciones,
      landedCost: b.landed_cost,
    },
    vigenciaBase,
  };
}

function shortNumeroFromId(id: string): string {
  return id.replace(/-/g, "").slice(-8).toUpperCase();
}

function shortNumeroFromNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}`;
}

/** Arma el ExportData común a exportPdf/exportXlsx tanto desde el resultado en
 * vivo del cotizador (con el CifInputs vigente en el form) como desde una
 * cotización guardada en el historial. No recalcula ningún importe: todos
 * salen del cost_breakdown / classifications que ya trajo el backend. */
export function buildExportData(source: ExportDataSource): ExportData | null {
  if (source.kind === "live") {
    const { result, cif, email } = source;
    const primary = result.classifications[0];
    if (!primary || !result.cost_breakdown) return null;
    const productoNombre = result.product?.identified_name ?? primary.description;
    const fuente: Fuente =
      FUENTE_BY_RATE_SOURCE[primary.rates_source.derecho_importacion] ?? "estimado";
    return fromParts(
      primary,
      result.cost_breakdown,
      productoNombre,
      fuente,
      cif.destino,
      cif.iibb_pct,
      shortNumeroFromNow(),
      new Date().toISOString(),
      email,
      result.vigencia_base
    );
  }

  const { detail, email } = source;
  const { resultado } = detail;
  const primary = resultado.classifications[0];
  if (!primary || !resultado.cost_breakdown) return null;
  const productoNombre = resultado.product?.identified_name ?? detail.producto;
  const entrada = resultado.entrada;
  return fromParts(
    primary,
    resultado.cost_breakdown,
    productoNombre,
    detail.fuente,
    (entrada?.destino as CifInputs["destino"]) ?? null,
    null,
    shortNumeroFromId(detail.id),
    detail.created_at,
    email,
    resultado.vigencia_base
  );
}
