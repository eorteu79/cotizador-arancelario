/** Tokens de marca para los documentos exportados (PDF/Excel). Fuente de
 * verdad estética: Cotizacion_Ejemplo_PDF_Tailwind.pdf / .xlsx y
 * Ejemplo_PDF_plantilla.html. Sin sombras ni gradientes — se separa con
 * reglas finas. */
export const COLORS = {
  navy: "#1B2432",
  gold: "#B8965A",
  goldLight: "#CBA96A",
  burgundy: "#7C2E38",
  ivory: "#FBF8F2",
  ink: "#1B2432",
  muted: "#5A6473",
  green: "#4E6B2E",
  amber: "#9A6B1E",
  rule: "#D8D2C6",
  faint: "#9AA0AA",
} as const;

/** Fondos tenues para los badges de fuente (verde/ámbar/borgoña), tomados
 * directo del Excel de referencia (tinte ~8-10% del color sobre blanco).
 * Los ajustes (fase 5.4: override o corrección manual) NO tienen un badge de
 * color propio a este nivel — se marcan solo con el asterisco + nota al pie
 * por campo (ver RateCardData.ajustado / ExportData.tieneAjustes). */
export const BADGE_FILL: Record<"base" | "estimado" | "sin_dato", string> = {
  base: "#EDF2E6",
  estimado: "#F7F0DE",
  sin_dato: "#F2EAEB",
};

export const FUENTE_BADGE: Record<
  "base" | "estimado" | "sin_dato",
  { label: string; color: string }
> = {
  base: { label: "BASE OFICIAL", color: COLORS.green },
  estimado: { label: "ESTIMADO IA", color: COLORS.amber },
  sin_dato: { label: "VERIFICAR", color: COLORS.burgundy },
};

export const RATE_CARD_COLOR: Record<"navy" | "gold" | "burg", string> = {
  navy: COLORS.navy,
  gold: COLORS.gold,
  burg: COLORS.burgundy,
};

export const DESGLOSE_TONO_COLOR: Record<"navy" | "burg" | "tinta", string> = {
  navy: COLORS.navy,
  burg: COLORS.burgundy,
  tinta: COLORS.ink,
};
