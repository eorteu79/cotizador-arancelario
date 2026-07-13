/** Formato AR: miles con punto, decimales con coma (ej. 1.779,05). */
export function fmtNumero(n: number, decimals = 2): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtMoneda(n: number, moneda: string, decimals = 2): string {
  return `${moneda} ${fmtNumero(n, decimals)}`;
}

export function fmtPct(n: number, decimals = 1): string {
  return `${fmtNumero(n, decimals)}%`;
}

export function fmtFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const MESES_ABREV = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** Fecha corta tipo "13 jul 2026", para el header de los documentos exportados. */
export function fmtFechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MESES_ABREV[d.getMonth()]} ${d.getFullYear()}`;
}
