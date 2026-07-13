import helveticaNormal from "pdfkit/js/data/Helvetica.afm?raw";
import helveticaBold from "pdfkit/js/data/Helvetica-Bold.afm?raw";
import helveticaOblique from "pdfkit/js/data/Helvetica-Oblique.afm?raw";
import helveticaBoldOblique from "pdfkit/js/data/Helvetica-BoldOblique.afm?raw";

/** pdfmake's browser bundle only maps 'Helvetica' etc. to pdfkit's built-in
 * AFM metrics — it doesn't ship the .afm data itself in the browser build, so
 * StandardFont throws "not found in virtual file system" unless we register
 * it ourselves. Avoids embedding a TTF (e.g. Roboto) just to print text. */
export const HELVETICA_VFS: Record<string, { data: string; encoding: "utf8" }> = {
  "data/Helvetica.afm": { data: helveticaNormal, encoding: "utf8" },
  "data/Helvetica-Bold.afm": { data: helveticaBold, encoding: "utf8" },
  "data/Helvetica-Oblique.afm": { data: helveticaOblique, encoding: "utf8" },
  "data/Helvetica-BoldOblique.afm": { data: helveticaBoldOblique, encoding: "utf8" },
};

export const HELVETICA_FONT_DESCRIPTOR = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};
