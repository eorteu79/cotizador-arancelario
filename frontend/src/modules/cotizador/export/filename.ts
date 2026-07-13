function yyyymmdd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "00000000";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function sanitizeNcm(ncm: string): string {
  return ncm.replace(/[^0-9A-Za-z]+/g, "") || "SINNCM";
}

export function exportFileBaseName(ncm: string, fechaIso: string): string {
  return `Cotizacion_${sanitizeNcm(ncm)}_${yyyymmdd(fechaIso)}`;
}
