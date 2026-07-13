function yyyymmdd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "00000000";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** YYYYMMDD-HHmmss de "ahora" — fallback cuando no hay id (el guardado en el
 * historial falló), para no romper la descarga y no repetir nombre entre
 * exports sucesivos de la misma sesión. */
function timestampNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}${pad(d.getSeconds())}`;
}

function shortId(id: string): string {
  return id.replace(/[^0-9A-Za-z]+/g, "").slice(0, 8).toUpperCase();
}

/** Nombre base (sin extensión) compartido por el export PDF y Excel de una
 * cotización: Cotizacion_<idCorto>_<YYYYMMDD>, con la fecha de creación de la
 * cotización (no la de hoy). `id` vacío (guardado en el historial falló) cae
 * a un timestamp para no romper la descarga. */
export function exportFileBaseName(id: string, fechaIso: string): string {
  if (!id) return `Cotizacion_${timestampNow()}`;
  return `Cotizacion_${shortId(id)}_${yyyymmdd(fechaIso)}`;
}
