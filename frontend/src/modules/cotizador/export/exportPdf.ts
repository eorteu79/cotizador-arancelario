import type { Column, Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { fmtFechaCorta, fmtMoneda, fmtNumero, fmtPct } from "./format";
import { exportFileBaseName } from "./filename";
import { COLORS, DESGLOSE_TONO_COLOR, FUENTE_BADGE, RATE_CARD_COLOR } from "./tokens";
import type { ExportData } from "./types";

const PAGE_WIDTH = 595.28;
const MARGIN_X = 40;
const BAND_HEIGHT = 150;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

function pctRound1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Tag con borde + fondo tenue del color, en vez de un pill sólido — así se
 * lee el color como estado (verde/ámbar/borgoña) y no como una etiqueta
 * genérica. `bullet` agrega el "• " que usa el badge de producto (no el de
 * las tarjetas de arancel). */
function badge(label: string, color: string, opts: { fontSize?: number; bullet?: boolean } = {}): Content {
  const fontSize = opts.fontSize ?? 7;
  return {
    table: {
      widths: ["auto"],
      body: [
        [
          {
            // "•" (U+2022) — Helvetica's WinAnsi metrics don't cover U+25CF.
            text: opts.bullet ? `• ${label}` : label,
            color,
            bold: true,
            fontSize,
            margin: [6, 3, 6, 3],
            alignment: "center",
            fillColor: color,
            fillOpacity: 0.08,
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.75,
      vLineWidth: () => 0.75,
      hLineColor: () => color,
      vLineColor: () => color,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

function thinRule(marginV: [number, number] = [10, 14]): Content {
  return {
    canvas: [
      { type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 1, lineColor: COLORS.rule },
    ],
    margin: [0, marginV[0], 0, marginV[1]],
  };
}

function paramCol(label: string, value: string): Column {
  return {
    width: "*",
    stack: [
      { text: label, style: "paramLabel" },
      { text: value, style: "paramValue", margin: [0, 3, 0, 0] },
    ],
  };
}

function totalRow(label: string, value: string): Content {
  return {
    columns: [
      { text: label, color: COLORS.muted, fontSize: 9.5, width: "*" },
      { text: value, color: COLORS.ink, fontSize: 10, alignment: "right", width: "auto" },
    ],
    margin: [0, 0, 0, 7],
  };
}

function totalsRule(width: number): Content {
  return {
    canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.75, lineColor: COLORS.rule }],
    margin: [0, 2, 0, 7],
  };
}

function buildHeader(data: ExportData, logoDataUrl: string): Content[] {
  return [
    {
      absolutePosition: { x: 0, y: 0 },
      columns: [
        { width: MARGIN_X, text: "" },
        { width: 150, image: logoDataUrl, margin: [0, 26, 0, 0] },
        { width: "*", text: "" },
        {
          width: 220,
          stack: [
            {
              text: [
                { text: "Cotización ", color: COLORS.goldLight },
                { text: `#${data.cotizacionNumero}`, color: COLORS.ivory, bold: true },
              ],
              fontSize: 10,
              alignment: "right",
              margin: [0, 28, 0, 0],
            },
            {
              text: fmtFechaCorta(data.fechaIso),
              color: COLORS.goldLight,
              fontSize: 8,
              alignment: "right",
              margin: [0, 4, 0, 0],
            },
            {
              text: data.email,
              color: COLORS.goldLight,
              fontSize: 8,
              alignment: "right",
              margin: [0, 2, 0, 0],
            },
          ],
        },
        { width: MARGIN_X, text: "" },
      ],
    },
    {
      text: "CLASIFICADOR ARANCELARIO",
      color: COLORS.gold,
      bold: true,
      fontSize: 9,
      characterSpacing: 1,
      absolutePosition: { x: MARGIN_X, y: 96 },
    },
    {
      text: "COTIZACIÓN DE IMPORTACIÓN",
      color: COLORS.ivory,
      bold: true,
      fontSize: 20,
      absolutePosition: { x: MARGIN_X, y: 110 },
    },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: CONTENT_WIDTH,
          y2: 0,
          lineWidth: 1,
          lineColor: COLORS.goldLight,
        },
      ],
      absolutePosition: { x: MARGIN_X, y: BAND_HEIGHT - 14 },
    },
  ];
}

function buildProductoRow(data: ExportData): Content {
  const badgeInfo = FUENTE_BADGE[data.fuente];
  return {
    columns: [
      {
        width: "*",
        stack: [
          { text: "01 · Producto", style: "sectionEyebrow" },
          {
            text: data.productoNombre.toUpperCase(),
            bold: true,
            fontSize: 13,
            color: COLORS.navy,
            margin: [0, 6, 0, 0],
          },
        ],
      },
      {
        width: 190,
        stack: [
          { text: "POSICIÓN NCM", style: "sectionEyebrow", alignment: "right" },
          {
            text: data.ncm,
            bold: true,
            fontSize: 19,
            color: COLORS.navy,
            alignment: "right",
            margin: [0, 2, 0, 6],
          },
          {
            columns: [
              { text: "", width: "*" },
              {
                width: "auto",
                stack: [badge(badgeInfo.label, badgeInfo.color, { bullet: true, fontSize: 7.5 })],
              },
            ],
          },
        ],
      },
    ],
  };
}

function buildParametros(data: ExportData): Content {
  return {
    columnGap: 14,
    columns: [
      paramCol("VALOR CIF", fmtMoneda(data.cifValue, data.moneda)),
      paramCol("TIPO DE CAMBIO", "—"),
      paramCol("DESTINO", data.destinoLabel),
      paramCol("PROVINCIA IIBB", data.iibbPct !== null ? fmtPct(data.iibbPct) : "—"),
    ],
    margin: [0, 0, 0, 20],
  };
}

function buildRateCards(data: ExportData): Content {
  const body: TableCell[][] = [
    data.rateCards.map((rc): TableCell => {
      const badgeInfo = FUENTE_BADGE[rc.fuente];
      return {
        stack: [
          { text: rc.label.toUpperCase(), color: COLORS.muted, fontSize: 7, bold: true },
          {
            text: fmtPct(rc.pct),
            color: RATE_CARD_COLOR[rc.color],
            bold: true,
            fontSize: 15,
            margin: [0, 5, 0, 6],
          },
          badge(badgeInfo.label, badgeInfo.color, { fontSize: 6 }),
        ],
      };
    }),
  ];
  return {
    table: {
      widths: data.rateCards.map(() => "*"),
      body,
    },
    layout: {
      hLineWidth: () => 0.75,
      vLineWidth: () => 0.75,
      hLineColor: () => COLORS.rule,
      vLineColor: () => COLORS.rule,
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 10,
      paddingBottom: () => 10,
    },
    margin: [0, 0, 0, 20],
  };
}

function buildDesglose(data: ExportData): Content {
  const headerCell = (text: string, alignment?: "right"): TableCell => ({
    text,
    color: COLORS.muted,
    bold: true,
    fontSize: 7.5,
    alignment,
    margin: [0, 0, 0, 5],
  });
  const header: TableCell[] = [
    headerCell("CONCEPTO"),
    headerCell("BASE IMPONIBLE", "right"),
    headerCell("ALÍCUOTA", "right"),
    headerCell("IMPORTE (USD)", "right"),
  ];
  const rows: TableCell[][] = data.desglose.map((r, i): TableCell[] => {
    // Separa visualmente el grupo "percepciones s/ IVA" (a partir de la fila
    // de IVA) del grupo "s/ CIF" (DIE + tasa), como en la plantilla.
    const topPad = i === 2 ? 8 : 5;
    return [
      {
        text: [
          { text: r.concepto, bold: true, color: DESGLOSE_TONO_COLOR[r.tono] },
          r.sufijo ? { text: `  · ${r.sufijo}`, color: COLORS.muted, fontSize: 7.5 } : "",
        ],
        fontSize: 9.5,
        margin: [0, topPad, 0, 5],
      },
      {
        text: fmtNumero(r.baseImponible),
        alignment: "right",
        fontSize: 9.5,
        margin: [0, topPad, 0, 5],
      },
      {
        text: fmtPct(pctRound1(r.alicuotaPct), pctRound1(r.alicuotaPct) % 1 === 0 ? 0 : 1),
        alignment: "right",
        fontSize: 8.5,
        color: COLORS.muted,
        margin: [0, topPad, 0, 5],
      },
      {
        text: fmtNumero(r.importeUsd),
        alignment: "right",
        fontSize: 9.5,
        margin: [0, topPad, 0, 5],
      },
    ];
  });
  return {
    table: {
      widths: ["*", 95, 60, 90],
      headerRows: 1,
      body: [header, ...rows],
    },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 1 : i === 0 ? 0 : 0.75),
      vLineWidth: () => 0,
      hLineColor: (i: number) => (i === 1 ? COLORS.navy : COLORS.rule),
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 16],
  };
}

const TOTALES_WIDTH = 270;

function buildTotales(data: ExportData): Content {
  const stack: Content[] = [
    totalRow("Valor CIF", fmtMoneda(data.totales.cifValue, data.moneda)),
    totalsRule(TOTALES_WIDTH),
    totalRow(
      "Tributos aduaneros (DIE + tasa + IVA)",
      fmtMoneda(data.totales.tributosAduaneros, data.moneda)
    ),
    totalRow("Percepciones (IVA + Gan. + IIBB)", fmtMoneda(data.totales.percepciones, data.moneda)),
    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                { text: "COSTO LANDED ESTIMADO", color: COLORS.goldLight, bold: true, fontSize: 9 },
                {
                  text: `${data.moneda} ${fmtNumero(data.totales.landedCost)}`,
                  color: COLORS.ivory,
                  bold: true,
                  fontSize: 15,
                  margin: [0, 4, 0, 0],
                },
              ],
              fillColor: COLORS.navy,
              margin: [14, 10, 14, 10],
            },
          ],
        ],
      },
      layout: "noBorders",
      margin: [0, 6, 0, 0],
    },
  ];
  return {
    columns: [
      { text: "", width: "*" },
      { width: TOTALES_WIDTH, stack },
    ],
  };
}

function buildPie(data: ExportData): Content[] {
  return [
    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                { text: "AVISO", bold: true, color: COLORS.burgundy, fontSize: 7.5, margin: [0, 0, 0, 3] },
                {
                  text: [
                    { text: "Estimación orientativa generada por la plataforma Tailwind. La posición NCM es sugerida y los importes son aproximados: " },
                    { text: "validar con su despachante de aduana", bold: true },
                    {
                      text: " antes de operar. Las percepciones pueden variar según certificados de exclusión, régimen del importador y normativa vigente.",
                    },
                  ],
                  color: COLORS.muted,
                  fontSize: 8,
                  lineHeight: 1.3,
                },
              ],
              margin: [10, 4, 0, 4],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i: number) => (i === 0 ? 2 : 0),
        vLineColor: () => COLORS.burgundy,
      },
      margin: [0, 22, 0, 0],
    },
    {
      margin: [0, 14, 0, 0],
      columns: [
        {
          text: "TAILWIND GLOBAL COMMERCE · app.tailwindgc.com",
          fontSize: 7.5,
          color: COLORS.faint,
          width: "*",
        },
        {
          text: data.vigenciaBase,
          fontSize: 7.5,
          color: COLORS.faint,
          alignment: "right",
          width: "auto",
        },
      ],
    },
  ];
}

function buildDocDefinition(data: ExportData, logoDataUrl: string): TDocumentDefinitions {
  return {
    pageSize: "A4",
    pageMargins: [MARGIN_X, BAND_HEIGHT + 20, MARGIN_X, 40],
    background: (currentPage: number) =>
      currentPage === 1
        ? { canvas: [{ type: "rect", x: 0, y: 0, w: PAGE_WIDTH, h: BAND_HEIGHT, color: COLORS.navy }] }
        : null,
    defaultStyle: { font: "Helvetica", color: COLORS.ink, fontSize: 10 },
    styles: {
      sectionEyebrow: { color: COLORS.gold, bold: true, fontSize: 9 },
      paramLabel: { color: COLORS.muted, fontSize: 7, bold: true },
      paramValue: { color: COLORS.ink, fontSize: 11, bold: true },
    },
    content: [
      ...buildHeader(data, logoDataUrl),
      buildProductoRow(data),
      thinRule(),
      buildParametros(data),
      {
        text: [
          { text: "02  ", color: COLORS.gold },
          { text: "ARANCELES E IMPUESTOS" },
        ],
        style: "sectionEyebrow",
        margin: [0, 0, 0, 8],
      },
      buildRateCards(data),
      {
        text: [
          { text: "03  ", color: COLORS.gold },
          { text: "DESGLOSE DE TRIBUTOS Y PERCEPCIONES" },
        ],
        style: "sectionEyebrow",
        margin: [0, 0, 0, 8],
      },
      buildDesglose(data),
      buildTotales(data),
      ...buildPie(data),
    ],
  };
}

/** Genera y descarga el PDF one-pager A4 de la cotización. Carga pdfmake de
 * forma perezosa para no engordar el bundle inicial del shell. */
export async function exportCotizacionPdf(data: ExportData): Promise<void> {
  // pdfmake's browser bundle exports a class instance (methods live on the
  // prototype, not as own properties), so named imports resolve to
  // undefined at runtime — grab the synthetic default export (the instance
  // itself) and call methods on it directly. The published types only
  // declare named exports, so the default needs an unknown-cast.
  const [pdfMakeModule, { LOGO_HEADER_PNG_BASE64 }, { HELVETICA_VFS, HELVETICA_FONT_DESCRIPTOR }] =
    await Promise.all([
      import("pdfmake/build/pdfmake"),
      import("./logoBase64"),
      import("./standardFonts"),
    ]);
  const pdfMake = (pdfMakeModule as unknown as { default: typeof pdfMakeModule }).default;

  // pdfmake's browser bundle maps 'Helvetica' to pdfkit's standard font
  // loader, but doesn't ship the actual .afm metrics in that bundle — without
  // registering them the loader throws "not found in virtual file system".
  pdfMake.addVirtualFileSystem(HELVETICA_VFS as unknown as Record<string, string>);
  pdfMake.setFonts(HELVETICA_FONT_DESCRIPTOR);

  const docDefinition = buildDocDefinition(data, LOGO_HEADER_PNG_BASE64);
  const pdf = pdfMake.createPdf(docDefinition);
  await pdf.download(`${exportFileBaseName(data.id, data.fechaIso)}.pdf`);
}
