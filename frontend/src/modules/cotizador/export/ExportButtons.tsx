import { useState } from "react";
import type { ExportData } from "./types";

type Generating = "pdf" | "xlsx" | null;

export default function ExportButtons({ data }: { data: ExportData | null }) {
  const [generating, setGenerating] = useState<Generating>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;

  async function onExportPdf() {
    setGenerating("pdf");
    setError(null);
    try {
      const { exportCotizacionPdf } = await import("./exportPdf");
      await exportCotizacionPdf(data as ExportData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(null);
    }
  }

  async function onExportXlsx() {
    setGenerating("xlsx");
    setError(null);
    try {
      const { exportCotizacionXlsx } = await import("./exportXlsx");
      await exportCotizacionXlsx(data as ExportData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div>
      <div className="button-row export-buttons">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={generating !== null}
          onClick={onExportPdf}
        >
          ⬇ {generating === "pdf" ? "Generando PDF..." : "Descargar PDF"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={generating !== null}
          onClick={onExportXlsx}
        >
          ⬇ {generating === "xlsx" ? "Generando Excel..." : "Descargar Excel"}
        </button>
      </div>
      {error && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          No se pudo generar el archivo: {error}
        </div>
      )}
    </div>
  );
}
