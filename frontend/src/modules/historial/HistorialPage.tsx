import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { Results } from "../cotizador/CotizadorPage";
import { IIBB_DEFAULT_BY_DESTINO } from "../cotizador/constants";
import type { CifInputs, Destino } from "../cotizador/types";
import { buildExportData } from "../cotizador/export/buildExportData";
import ExportButtons from "../cotizador/export/ExportButtons";
import { getHistorialDetail, listHistorial } from "./api";
import type { HistorialDetail, HistorialItem } from "./types";

const PAGE_SIZE = 50;

const FUENTE_LABEL: Record<HistorialItem["fuente"], string> = {
  base: "Base oficial",
  estimado: "Estimado IA",
  sin_dato: "Sin dato — verificar",
  ajuste: "Ajustado — Tailwind",
};

const FUENTE_CLASS: Record<HistorialItem["fuente"], string> = {
  base: "src-tag src-base",
  estimado: "src-tag src-ia",
  sin_dato: "src-tag src-verificar",
  ajuste: "src-tag src-ajuste",
};

function FuenteBadge({ fuente }: { fuente: HistorialItem["fuente"] }) {
  return <span className={FUENTE_CLASS[fuente]}>{FUENTE_LABEL[fuente]}</span>;
}

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncar(s: string, n = 70): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export default function HistorialPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [items, setItems] = useState<HistorialItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Tagged with the id they were fetched for, so switching selection never
  // flashes the *previous* row's detail/error while the new one is loading.
  const [detail, setDetail] = useState<HistorialDetail | null>(null);
  const [detailError, setDetailError] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    listHistorial(PAGE_SIZE, 0)
      .then((r) => {
        setItems(r.items);
        setOffset(r.items.length);
        setHasMore(r.items.length === PAGE_SIZE);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    getHistorialDetail(selectedId)
      .then(setDetail)
      .catch((e) =>
        setDetailError({ id: selectedId, message: e instanceof Error ? e.message : String(e) })
      );
  }, [selectedId]);

  const showingDetail = detail?.id === selectedId ? detail : null;
  const currentDetailError = detailError?.id === selectedId ? detailError.message : null;
  const detailLoading = selectedId !== null && !showingDetail && !currentDetailError;

  function onLoadMore() {
    setLoadingMore(true);
    listHistorial(PAGE_SIZE, offset)
      .then((r) => {
        setItems((prev) => [...(prev ?? []), ...r.items]);
        setOffset(offset + r.items.length);
        setHasMore(r.items.length === PAGE_SIZE);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingMore(false));
  }

  function onRetomar() {
    if (!showingDetail) return;
    const { resultado } = showingDetail;
    const { entrada } = resultado;

    if (entrada) {
      const destino = entrada.destino as Destino;
      navigate("/cotizador", {
        state: {
          retomar: {
            mode: entrada.modo,
            text: entrada.modo === "text" ? entrada.valor : "",
            url: entrada.modo === "url" ? entrada.valor : "",
            cif: {
              cif_value: entrada.cif,
              currency: entrada.moneda,
              destino,
              iibb_pct: IIBB_DEFAULT_BY_DESTINO[destino] ?? 2.5,
            },
          },
        },
      });
      return;
    }

    // Sin entrada guardada (pdf/foto): best-effort a partir del resultado.
    const primary = resultado.classifications[0];
    const text =
      resultado.product?.summary ??
      resultado.product?.identified_name ??
      primary?.description ??
      showingDetail.producto;
    const cif: CifInputs | undefined = resultado.cost_breakdown
      ? {
          cif_value: resultado.cost_breakdown.cif_value,
          currency: resultado.cost_breakdown.currency,
          destino: "bien_cambio",
          iibb_pct: 2.5,
        }
      : undefined;
    navigate("/cotizador", { state: { retomar: { text, cif } } });
  }

  if (selectedId) {
    return (
      <div className="app">
        <div className="header">
          <div className="eyebrow">Historial de cotizaciones</div>
          <h1>Detalle de la cotización</h1>
          <div className="goldrule" />
        </div>

        <button
          className="btn btn-secondary"
          style={{ marginBottom: 20, flex: "0 0 auto" }}
          onClick={() => setSelectedId(null)}
        >
          ← Volver al historial
        </button>

        {detailLoading && (
          <div className="loader">
            <div className="spinner" />
            <span>Cargando cotización...</span>
          </div>
        )}

        {currentDetailError && <div className="alert alert-error">{currentDetailError}</div>}

        {showingDetail && (
          <>
            <div className="button-row" style={{ marginBottom: 20 }}>
              <button className="btn" onClick={onRetomar}>
                Retomar en el cotizador
              </button>
            </div>

            {showingDetail.resultado.entrada && (
              <div className="card">
                <div className="sec-h">
                  <span className="n">00</span>
                  <h2>Consulta original</h2>
                </div>
                {showingDetail.resultado.entrada.modo === "url" ? (
                  <p>
                    <a
                      href={showingDetail.resultado.entrada.valor}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {showingDetail.resultado.entrada.valor}
                    </a>
                  </p>
                ) : (
                  <p style={{ whiteSpace: "pre-wrap" }}>
                    {showingDetail.resultado.entrada.valor}
                  </p>
                )}
              </div>
            )}

            <Results result={showingDetail.resultado} />
            <ExportButtons
              data={buildExportData({
                kind: "historial",
                detail: showingDetail,
                email: user?.email ?? "",
              })}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <div className="eyebrow">Historial</div>
        <h1>Cotizaciones anteriores</h1>
        <p className="lead">Tus últimas cotizaciones, más recientes primero.</p>
        <div className="goldrule" />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!error && items === null && (
        <div className="loader">
          <div className="spinner" />
          <span>Cargando historial...</span>
        </div>
      )}

      {items && items.length === 0 && (
        <div className="card">
          <p className="hint">Todavía no hiciste ninguna cotización.</p>
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <div className="card" style={{ padding: 0 }}>
            <div className="hist-list">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="hist-row"
                  onClick={() => setSelectedId(it.id)}
                >
                  <span className="hist-fecha">{fmtFecha(it.created_at)}</span>
                  <span className="hist-producto-col">
                    <span className="hist-producto">{truncar(it.producto)}</span>
                    {it.entrada && (
                      <span className="hist-entrada">
                        {it.entrada.modo === "url" ? "URL: " : "Texto: "}
                        {truncar(it.entrada.valor, 80)}
                      </span>
                    )}
                  </span>
                  <span className="hist-ncm">{it.ncm ?? "—"}</span>
                  <FuenteBadge fuente={it.fuente} />
                </button>
              ))}
            </div>
          </div>

          {hasMore && (
            <div className="button-row" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? "Cargando..." : "Cargar más"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
