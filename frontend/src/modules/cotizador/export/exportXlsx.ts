import type { Cell, Workbook, Worksheet } from "exceljs";
import { exportFileBaseName } from "./filename";
import { fmtFechaCorta } from "./format";
import { BADGE_FILL, COLORS, DESGLOSE_TONO_COLOR, FUENTE_BADGE, RATE_CARD_COLOR } from "./tokens";
import type { ExportData } from "./types";

/** ARGB helper — ExcelJS quiere 'FF' + hex sin '#'. */
function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

/** numFmt con el prefijo de moneda embebido, tal como en el Excel de
 * referencia (así el total queda como "USD 1.000,00" siendo un número real). */
function moneyFmt(moneda: string): string {
  return `"${moneda}" #,##0.00`;
}
const PCT_FMT = "0.0%";

interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: string;
  fill?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  numFmt?: string;
  border?: Partial<Record<"top" | "bottom" | "left" | "right", string>>;
  borderStyle?: "thin" | "medium";
  wrap?: boolean;
}

function styleCell(cell: Cell, style: CellStyle) {
  cell.font = {
    name: "Calibri",
    bold: style.bold ?? false,
    italic: style.italic ?? false,
    size: style.size ?? 10,
    color: { argb: argb(style.color ?? COLORS.ink) },
  };
  cell.alignment = {
    horizontal: style.align ?? "left",
    vertical: style.valign ?? "middle",
    wrapText: style.wrap ?? false,
  };
  if (style.fill) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(style.fill) } };
  }
  if (style.numFmt) {
    cell.numFmt = style.numFmt;
  }
  if (style.border) {
    const s = style.borderStyle ?? "thin";
    cell.border = {
      ...(style.border.top ? { top: { style: s, color: { argb: argb(style.border.top) } } } : {}),
      ...(style.border.bottom
        ? { bottom: { style: s, color: { argb: argb(style.border.bottom) } } }
        : {}),
      ...(style.border.left ? { left: { style: s, color: { argb: argb(style.border.left) } } } : {}),
      ...(style.border.right ? { right: { style: s, color: { argb: argb(style.border.right) } } } : {}),
    };
  }
}

/** Fusiona el rango y escribe SIEMPRE en la celda superior-izquierda (si se
 * escribe en otra celda del merge, ExcelJS descarta el valor). */
function mergeSet(ws: Worksheet, range: string, value: string | number, style: CellStyle) {
  ws.mergeCells(range);
  const topLeft = range.split(":")[0];
  const cell = ws.getCell(topLeft);
  cell.value = value;
  styleCell(cell, style);
}

function set(ws: Worksheet, addr: string, value: string | number, style: CellStyle) {
  const cell = ws.getCell(addr);
  cell.value = value;
  styleCell(cell, style);
}

const AVISO_TEXT =
  "Estimación orientativa generada por la plataforma Tailwind. La posición NCM es sugerida y los importes son aproximados: " +
  "validar con su despachante de aduana antes de operar. Las percepciones pueden variar según certificados de exclusión, " +
  "régimen del importador y normativa vigente.";

/** Genera y descarga el Excel one-pager A4 de la cotización. Carga ExcelJS de
 * forma perezosa para no engordar el bundle inicial del shell. Replica fila
 * por fila el Cotizacion_Ejemplo_Excel_Tailwind.xlsx de referencia. */
export async function exportCotizacionXlsx(data: ExportData): Promise<void> {
  const ExcelJS = await import("exceljs");
  const { LOGO_HEADER_PNG_BASE64 } = await import("./logoBase64");

  const workbook: Workbook = new ExcelJS.Workbook();
  const ws: Worksheet = workbook.addWorksheet("Cotización", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
    },
  });

  ws.columns = [
    { width: 3 }, // A
    { width: 30 }, // B
    { width: 16 }, // C
    { width: 15 }, // D
    { width: 16 }, // E
    { width: 16 }, // F
    { width: 3 }, // G
  ];

  // ---------- header: banda navy (filas 1-4) con logo + doc-meta ----------
  ws.getRow(1).height = 10;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 20;
  ws.getRow(4).height = 12;
  for (let row = 1; row <= 4; row++) {
    for (let col = 1; col <= 7; col++) {
      ws.getCell(row, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(COLORS.navy) } };
    }
  }

  const imageId = workbook.addImage({
    base64: LOGO_HEADER_PNG_BASE64.replace(/^data:image\/png;base64,/, ""),
    extension: "png",
  });
  ws.addImage(imageId, { tl: { col: 1.15, row: 0.2 }, ext: { width: 120, height: 26 } });

  mergeSet(ws, "E2:G2", `Cotización #${data.cotizacionNumero}`, {
    bold: true,
    color: COLORS.ivory,
    fill: COLORS.navy,
    align: "right",
    size: 10,
  });
  mergeSet(
    ws,
    "E3:G3",
    `${fmtFechaCorta(data.fechaIso)}  ·  ${data.email}`,
    { color: COLORS.goldLight, fill: COLORS.navy, align: "right", size: 9 }
  );

  // ---------- eyebrow + título (fuera de la banda, fondo blanco) ----------
  ws.getRow(7).height = 22;
  set(ws, "B6", "CLASIFICADOR ARANCELARIO", { bold: true, color: COLORS.gold, size: 8 });
  set(ws, "B7", "COTIZACIÓN DE IMPORTACIÓN", { bold: true, color: COLORS.navy, size: 16 });

  // ---------- 01 · producto ----------
  set(ws, "B10", "01 · PRODUCTO", { bold: true, color: COLORS.gold, size: 8 });
  set(ws, "D10", "POSICIÓN NCM", { bold: true, color: COLORS.muted, size: 8, align: "right" });
  mergeSet(ws, "B11:C12", data.productoNombre.toUpperCase(), {
    bold: true,
    size: 11,
    color: COLORS.navy,
    valign: "top",
    wrap: true,
  });
  mergeSet(ws, "D11:E11", data.ncm, { bold: true, size: 16, color: COLORS.navy, align: "right" });
  const badgeInfo = FUENTE_BADGE[data.fuente];
  mergeSet(ws, "D12:E12", `• ${badgeInfo.label}`, {
    bold: true,
    size: 8,
    color: badgeInfo.color,
    align: "right",
  });

  // ---------- parámetros ----------
  const params: [string, string][] = [
    ["VALOR CIF", `${data.moneda} ${data.cifValue.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
    ["TIPO DE CAMBIO", "—"],
    ["DESTINO", data.destinoLabel],
    ["PROVINCIA IIBB", data.iibbPct !== null ? `${data.iibbPct.toFixed(1)}%` : "—"],
  ];
  const paramCols = ["B", "C", "D", "E"];
  params.forEach(([label], i) => {
    set(ws, `${paramCols[i]}15`, label, { bold: true, size: 8, color: COLORS.gold });
  });
  params.forEach(([, value], i) => {
    set(ws, `${paramCols[i]}16`, value, { bold: true, size: 10.5, color: COLORS.ink });
  });

  // ---------- 02 · aranceles e impuestos ----------
  set(ws, "B19", "02  ARANCELES E IMPUESTOS", { bold: true, color: COLORS.gold, size: 8 });
  ws.getRow(20).height = 14;
  ws.getRow(21).height = 20;
  ws.getRow(22).height = 15;
  const cardCols = ["B", "C", "D", "E", "F"];
  data.rateCards.forEach((rc, i) => {
    set(ws, `${cardCols[i]}20`, rc.label.toUpperCase(), {
      size: 7.5,
      bold: true,
      color: COLORS.muted,
      border: { top: COLORS.rule, left: COLORS.rule },
    });
    set(ws, `${cardCols[i]}21`, rc.pct / 100, {
      bold: true,
      size: 15,
      color: RATE_CARD_COLOR[rc.color],
      numFmt: PCT_FMT,
      border: { left: COLORS.rule },
    });
    const b = FUENTE_BADGE[rc.fuente];
    set(ws, `${cardCols[i]}22`, b.label, {
      bold: true,
      size: 7,
      color: b.color,
      fill: BADGE_FILL[rc.fuente],
      border: { bottom: COLORS.rule, left: COLORS.rule },
    });
  });
  // Cierra el box de tarjetas con un borde derecho luego de la última columna (F).
  for (const row of [20, 21, 22] as const) {
    const cell = ws.getCell(`F${row}`);
    cell.border = { ...cell.border, right: { style: "thin", color: { argb: argb(COLORS.rule) } } };
  }

  // ---------- 03 · desglose de tributos y percepciones ----------
  set(ws, "B24", "03  DESGLOSE DE TRIBUTOS Y PERCEPCIONES", { bold: true, color: COLORS.gold, size: 8 });
  const headerStyle: CellStyle = { bold: true, size: 8, color: COLORS.muted, border: { bottom: COLORS.navy } };
  set(ws, "B25", "CONCEPTO", headerStyle);
  set(ws, "C25", "BASE IMPONIBLE", { ...headerStyle, align: "right" });
  set(ws, "D25", "ALÍCUOTA", { ...headerStyle, align: "right" });
  set(ws, "E25", "IMPORTE (USD)", { ...headerStyle, align: "right" });

  let r = 26;
  for (const row of data.desglose) {
    ws.getRow(r).height = 17;
    const concepto = row.sufijo ? `${row.concepto}  ·  ${row.sufijo}` : row.concepto;
    set(ws, `B${r}`, concepto, {
      bold: true,
      size: 10,
      color: DESGLOSE_TONO_COLOR[row.tono],
      border: { bottom: COLORS.rule },
    });
    set(ws, `C${r}`, row.baseImponible, {
      size: 10,
      align: "right",
      numFmt: "#,##0.00",
      border: { bottom: COLORS.rule },
    });
    set(ws, `D${r}`, row.alicuotaPct / 100, {
      size: 10,
      align: "right",
      color: COLORS.muted,
      numFmt: PCT_FMT,
      border: { bottom: COLORS.rule },
    });
    set(ws, `E${r}`, row.importeUsd, {
      size: 10,
      align: "right",
      numFmt: "#,##0.00",
      border: { bottom: COLORS.rule },
    });
    r += 1;
  }
  r += 1;

  // ---------- totales ----------
  const totalRows: [string, number][] = [
    ["Valor CIF", data.totales.cifValue],
    ["Tributos aduaneros (DIE + tasa + IVA)", data.totales.tributosAduaneros],
    ["Percepciones (IVA + Gan. + IIBB)", data.totales.percepciones],
  ];
  for (const [label, value] of totalRows) {
    mergeSet(ws, `B${r}:D${r}`, label, { color: COLORS.muted, size: 10, align: "right" });
    mergeSet(ws, `E${r}:F${r}`, value, {
      color: COLORS.ink,
      size: 10,
      align: "right",
      numFmt: moneyFmt(data.moneda),
    });
    r += 1;
  }
  ws.getRow(r).height = 24;
  for (let col = 2; col <= 6; col++) {
    ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(COLORS.navy) } };
  }
  mergeSet(ws, `B${r}:C${r}`, "COSTO LANDED ESTIMADO", {
    bold: true,
    color: COLORS.goldLight,
    fill: COLORS.navy,
    size: 10,
  });
  mergeSet(ws, `D${r}:F${r}`, data.totales.landedCost, {
    bold: true,
    color: COLORS.ivory,
    fill: COLORS.navy,
    size: 13,
    align: "right",
    numFmt: moneyFmt(data.moneda),
  });
  r += 2;

  // ---------- pie ----------
  set(ws, `B${r}`, "AVISO", { bold: true, size: 8, color: COLORS.burgundy });
  r += 1;
  ws.getRow(r).height = 16;
  ws.getRow(r + 1).height = 16;
  ws.getRow(r + 2).height = 16;
  mergeSet(ws, `B${r}:F${r + 2}`, AVISO_TEXT, {
    size: 8.5,
    color: COLORS.muted,
    valign: "top",
    wrap: true,
    border: { left: COLORS.burgundy },
    borderStyle: "medium",
  });
  r += 4;
  mergeSet(ws, `B${r}:C${r}`, "TAILWIND GLOBAL COMMERCE · app.tailwindgc.com", {
    size: 8,
    color: COLORS.faint,
  });
  mergeSet(ws, `D${r}:F${r}`, data.vigenciaBase, { size: 8, color: COLORS.faint, align: "right" });

  ws.pageSetup.printArea = `A1:G${r}`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${exportFileBaseName(data.ncm, data.fechaIso)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
