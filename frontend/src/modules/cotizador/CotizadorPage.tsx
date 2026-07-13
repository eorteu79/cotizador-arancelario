import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { upsertOverride } from "../admin/api";
import type { OverrideIn } from "../admin/types";
import { useAuth } from "../../auth/useAuth";
import { useRole } from "../../auth/useRole";
import { ajusteManual, analyze, health, reclasificar, type CampoCorregible } from "./api";
import { IIBB_DEFAULT_BY_DESTINO } from "./constants";
import { buildExportData } from "./export/buildExportData";
import ExportButtons from "./export/ExportButtons";
import type {
  AnalyzeResponse,
  CifInputs,
  Classification,
  ClarificationAnswer,
  CostBreakdown,
  Destino,
  Mode,
  Probability,
  RateFieldSource,
  RetomarState,
} from "./types";

const MODE_LABELS: Record<Mode, string> = {
  text: "Texto",
  url: "URL",
  pdf: "PDF",
  image: "Foto",
};

function defaultCif(): CifInputs {
  return {
    cif_value: 100,
    currency: "USD",
    destino: "bien_cambio",
    iibb_pct: IIBB_DEFAULT_BY_DESTINO.bien_cambio,
  };
}

export default function CotizadorPage() {
  const location = useLocation();
  const { user } = useAuth();
  const retomar = (location.state as Partial<RetomarState> | null)?.retomar;

  const [mode, setMode] = useState<Mode>(retomar?.mode ?? "text");
  const [text, setText] = useState(retomar?.text ?? "");
  const [url, setUrl] = useState(retomar?.url ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [cif, setCif] = useState<CifInputs>(retomar?.cif ?? defaultCif());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [clarifAnswers, setClarifAnswers] = useState<Record<string, string>>({});
  const [keyOk, setKeyOk] = useState<boolean | null>(null);

  useEffect(() => {
    health()
      .then((r) => setKeyOk(r.anthropic_key_configured))
      .catch(() => setKeyOk(false));
  }, []);

  function reset() {
    setResult(null);
    setError(null);
    setClarifAnswers({});
  }

  async function onAnalyze(extraClarifications: ClarificationAnswer[] = []) {
    setLoading(true);
    setError(null);
    try {
      const r = await analyze({
        mode,
        text: mode === "text" ? text : undefined,
        url: mode === "url" ? url : undefined,
        file: mode === "pdf" || mode === "image" ? file : null,
        cif,
        clarifications: extraClarifications,
      });
      setResult(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function onSubmitClarifications() {
    const list: ClarificationAnswer[] = Object.entries(clarifAnswers)
      .filter(([, v]) => v && v.trim().length > 0)
      .map(([id, answer]) => ({ id, answer }));
    onAnalyze(list);
  }

  const canSubmit =
    !loading &&
    ((mode === "text" && text.trim().length > 0) ||
      (mode === "url" && url.trim().length > 0) ||
      ((mode === "pdf" || mode === "image") && file !== null));

  return (
    <div className="app">
      <div className="header">
        <div className="eyebrow">Clasificador Arancelario</div>
        <h1>Estimador de costo de importación a Argentina</h1>
        <p className="lead">
          Describí el producto (texto, URL, PDF o foto), indicá el valor CIF, y obtené una
          posición arancelaria NCM probable junto con la estimación de aranceles, impuestos y
          costo landed.
        </p>
        <div className="goldrule" />
      </div>

      {retomar && (
        <div className="alert alert-warning">
          {retomar.mode ? (
            "Retomaste una cotización del historial con la consulta original. Revisá los datos y volvé a analizar."
          ) : (
            "Retomaste una cotización del historial. Como el original era un PDF o una foto, la " +
            "descripción se generó a partir del resultado guardado — revisala y volvé a analizar."
          )}
        </div>
      )}

      {keyOk === false && (
        <div className="alert alert-warning">
          <strong>Atención:</strong> No se detectó <code>GEMINI_API_KEY</code> en el backend.
          Configurala en <code>backend/.env</code> y reiniciá el servidor.
        </div>
      )}

      <div className="card">
        <div className="sec-h">
          <span className="n">01</span>
          <h2>Definí el producto</h2>
        </div>
        <div className="tabs">
          {(["text", "url", "pdf", "image"] as Mode[]).map((m) => (
            <button
              key={m}
              className={`tab ${mode === m ? "active" : ""}`}
              onClick={() => {
                setMode(m);
                reset();
              }}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <InputArea
          mode={mode}
          text={text}
          setText={setText}
          url={url}
          setUrl={setUrl}
          file={file}
          setFile={setFile}
        />
      </div>

      <div className="card">
        <div className="sec-h">
          <span className="n">02</span>
          <h2>Datos del valor CIF</h2>
        </div>
        <CifForm cif={cif} setCif={setCif} />
      </div>

      <div className="button-row">
        <button className="btn" disabled={!canSubmit} onClick={() => onAnalyze([])}>
          {loading ? "Analizando..." : "Analizar producto"}
        </button>
        {result && (
          <button className="btn btn-secondary" onClick={reset} disabled={loading}>
            Limpiar resultado
          </button>
        )}
      </div>

      {loading && (
        <div className="loader">
          <div className="spinner" />
          <span>
            Consultando Gemini y buscando en la web... (puede tardar 20–60 segundos)
          </span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {result && result.needs_clarification && (
        <div className="qbox">
          <div className="sec-h" style={{ marginBottom: 6 }}>
            <span className="n">✳</span>
            <h2>Faltan algunos datos</h2>
          </div>
          <p className="hint" style={{ marginBottom: 16, marginTop: 0 }}>
            Para clasificar con mayor certeza, contestá las siguientes preguntas:
          </p>
          {result.clarification_questions.map((q) => (
            <div className="clarif-q" key={q.id}>
              <label htmlFor={`q-${q.id}`}>{q.question}</label>
              <input
                id={`q-${q.id}`}
                type="text"
                value={clarifAnswers[q.id] ?? ""}
                onChange={(e) =>
                  setClarifAnswers({ ...clarifAnswers, [q.id]: e.target.value })
                }
                placeholder="Tu respuesta..."
              />
              {q.why && <div className="why">{q.why}</div>}
            </div>
          ))}
          <button
            className="qsub"
            disabled={
              loading || Object.values(clarifAnswers).every((v) => !v || !v.trim())
            }
            onClick={onSubmitClarifications}
          >
            Continuar con estas respuestas
          </button>
        </div>
      )}

      {result && !result.needs_clarification && (
        <>
          <Results result={result} editable={{ cif, onUpdated: setResult }} />
          <ExportButtons
            data={buildExportData({ kind: "live", result, cif, email: user?.email ?? "" })}
          />
        </>
      )}

      <footer className="footer">
        <div>
          {result?.disclaimer ??
            "Resultados orientativos. Verificá con un despachante antes de operar."}
        </div>
        <div className="vigencia-base">
          {result?.vigencia_base ?? "Base NCM feb-2023 + correcciones 2026"}
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function InputArea(props: {
  mode: Mode;
  text: string;
  setText: (s: string) => void;
  url: string;
  setUrl: (s: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
}) {
  const { mode, text, setText, url, setUrl, file, setFile } = props;

  if (mode === "text") {
    return (
      <div>
        <label htmlFor="text-input">Descripción libre del producto</label>
        <textarea
          id="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej: estufa eléctrica halógena de cuarzo de 800W, uso doméstico, sin termostato. Material principal: chapa de acero. Fabricante: marca X, modelo Y."
        />
        <div className="hint">
          Cuanto más detalle (material, función, potencia, dimensiones, uso), mejor la
          clasificación.
        </div>
      </div>
    );
  }
  if (mode === "url") {
    return (
      <div>
        <label htmlFor="url-input">URL con la información del producto</label>
        <input
          id="url-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
        <div className="hint">
          Pegá un link del fabricante, distribuidor o marketplace con la ficha del producto.
        </div>
      </div>
    );
  }
  if (mode === "pdf") {
    return (
      <FileDrop
        accept=".pdf,application/pdf"
        label="Ficha técnica en PDF"
        file={file}
        setFile={setFile}
      />
    );
  }
  if (mode === "image") {
    return (
      <FileDrop
        accept="image/jpeg,image/png,image/webp,image/gif"
        label="Foto del producto"
        file={file}
        setFile={setFile}
      />
    );
  }
  return null;
}

function FileDrop(props: {
  accept: string;
  label: string;
  file: File | null;
  setFile: (f: File | null) => void;
}) {
  const { accept, label, file, setFile } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label>{label}</label>
      <div
        className={`dropzone ${file ? "has-file" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
      >
        {file ? (
          <>
            <p>
              <strong>{file.name}</strong>
            </p>
            <p>{(file.size / 1024).toFixed(1)} KB · clic para reemplazar</p>
          </>
        ) : (
          <>
            <p>
              <strong>Arrastrá un archivo</strong> o hacé clic para seleccionar
            </p>
            <p style={{ fontSize: 12 }}>Acepta: {accept}</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </div>
    </div>
  );
}

function CifForm({ cif, setCif }: { cif: CifInputs; setCif: (c: CifInputs) => void }) {
  return (
    <div>
      <div className="grid grid-3">
        <div>
          <label htmlFor="cif-value">Valor CIF</label>
          <input
            id="cif-value"
            type="number"
            min={0}
            step={0.01}
            value={cif.cif_value}
            onChange={(e) =>
              setCif({ ...cif, cif_value: parseFloat(e.target.value) || 0 })
            }
          />
          <div className="hint">Costo + Seguro + Flete (CIF) hasta puerto argentino.</div>
        </div>
        <div>
          <label htmlFor="cif-currency">Moneda</label>
          <select
            id="cif-currency"
            value={cif.currency}
            onChange={(e) => setCif({ ...cif, currency: e.target.value })}
          >
            <option>USD</option>
            <option>EUR</option>
            <option>ARS</option>
            <option>BRL</option>
            <option>CNY</option>
          </select>
        </div>
        <div>
          <label htmlFor="cif-destino">Destino de la mercadería</label>
          <select
            id="cif-destino"
            value={cif.destino}
            onChange={(e) => {
              const destino = e.target.value as Destino;
              setCif({ ...cif, destino, iibb_pct: IIBB_DEFAULT_BY_DESTINO[destino] });
            }}
          >
            <option value="bien_cambio">Bien de cambio (reventa)</option>
            <option value="bien_uso">Bien de uso (consumo propio)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginTop: 14 }}>
        <div>
          <label htmlFor="cif-iibb">Percepción IIBB (%)</label>
          <input
            id="cif-iibb"
            type="number"
            min={0}
            step={0.1}
            value={cif.iibb_pct}
            onChange={(e) =>
              setCif({ ...cif, iibb_pct: parseFloat(e.target.value) || 0 })
            }
          />
          <div className="hint">
            Varía según tu provincia/jurisdicción — ajustá el porcentaje si corresponde.
          </div>
        </div>
      </div>

      <div className="note-box">
        <strong>Bien de cambio</strong> (mercadería para comercializar): además de Derecho de
        Importación, Tasa Estadística e IVA, se suman las percepciones de IVA adicional (20%,
        o 10% si el bien tiene IVA reducido) y Ganancias (6%), más IIBB según tu provincia.
        <br />
        <strong>Bien de uso</strong> (consumo propio, vida útil ≥ 2 años): por la excepción de
        la RG 2937 (AFIP) no corresponden las percepciones de IVA adicional ni de Ganancias;
        la de IIBB normalmente tampoco aplica.
        <br />
        Los certificados de exclusión de percepción (RG 5655/2025) pueden reducir aún más
        estas percepciones — es un caso avanzado que este cálculo no contempla; consultalo con
        tu despachante.
      </div>
    </div>
  );
}

function Badge({ p }: { p: Probability }) {
  return <span className={`badge badge-${p}`}>{p}</span>;
}

export interface EditableCtx {
  cif: CifInputs;
  onUpdated: (r: AnalyzeResponse) => void;
}

export function Results({ result, editable }: { result: AnalyzeResponse; editable?: EditableCtx }) {
  const { product, classifications, cost_breakdown, notes } = result;
  const primary = classifications[0];
  const alternatives = classifications.slice(1);

  return (
    <>
      {product && (
        <div className="card">
          <div className="sec-h">
            <span className="n">03</span>
            <h2>Producto identificado</h2>
          </div>
          <div className="row wrapf gap12" style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: 17 }}>{product.identified_name}</strong>
            <Badge p={product.confidence} />
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            {product.summary}
          </p>
          {product.key_attributes &&
            Object.keys(product.key_attributes).length > 0 && (
              <div className="attrs">
                {Object.entries(product.key_attributes).map(([k, v]) => (
                  <div key={k} className="attr">
                    <div className="attr-label">{k.replace(/_/g, " ")}</div>
                    <div className="attr-value">{v}</div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {primary && (
        <>
          <div className="card">
            <div className="sec-h">
              <span className="n">04</span>
              <h2>Clasificación arancelaria (NCM)</h2>
            </div>
            <div className="sim">
              <div className="row between wrapf gap12">
                <span className="kk">Posición sugerida</span>
                <Badge p={primary.probability} />
              </div>
              <div className="code">{primary.ncm}</div>
              <p>{primary.description}</p>
              {primary.rationale && (
                <p className="sim-rationale">{primary.rationale}</p>
              )}
            </div>
            {editable && (
              <ClasificacionActions result={result} primary={primary} editable={editable} />
            )}
          </div>

          <div className="card">
            <div className="sec-h">
              <span className="n">05</span>
              <h2>Aranceles e impuestos</h2>
            </div>
            <div className="tariffs">
              <Tf
                label="DI"
                v={primary.rates.derecho_importacion_pct}
                color="v-navy"
                source={primary.rates_source.derecho_importacion}
              />
              <Tf
                label="Tasa Estad."
                v={primary.rates.tasa_estadistica_pct}
                color="v-gold"
                source={primary.rates_source.tasa_estadistica}
              />
              <Tf
                label="IVA"
                v={primary.rates.iva_pct}
                color="v-burg"
                source={primary.rates_source.iva}
              />
              <Tf
                label="IVA adic."
                v={primary.rates.iva_adicional_pct}
                color="v-navy"
                source={primary.rates_source.iva_adicional}
              />
              <Tf
                label="Ganancias"
                v={primary.rates.ganancias_pct}
                color="v-gold"
                source={primary.rates_source.ganancias}
              />
            </div>
            <p className="hint">
              IVA adicional y Ganancias son percepciones (RG 2937) que solo corresponden si el
              destino de la mercadería es "bien de cambio" — la IIBB configurada en el paso 02
              se suma según tu provincia. Mirá el desglose real aplicado en la estimación de
              costo landed más abajo.
            </p>
            {primary.nota_base && (
              <p className="hint" style={{ marginTop: 4 }}>
                <strong>Nota de la base oficial:</strong> {primary.nota_base}
              </p>
            )}
            <AjusteFootnote visible={Object.values(primary.rates_source).some((s) => s === "ajuste")} />
            {primary.requirements && primary.requirements.length > 0 && (
              <>
                <div className="subhead">Requisitos / cosas a tener en cuenta</div>
                <ul className="requirements">
                  {primary.requirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}

      {alternatives.length > 0 && (
        <div className="card">
          <div className="sec-h">
            <span className="n">06</span>
            <h2>Alternativas</h2>
          </div>
          <div className="hs-alts">
            {alternatives.map((c, i) => (
              <AltClassification key={c.ncm + i} c={c} />
            ))}
          </div>
        </div>
      )}

      {cost_breakdown && (
        <div className="card">
          <div className="sec-h">
            <span className="n">07</span>
            <h2>Estimación de costo landed</h2>
          </div>
          <CostTable b={cost_breakdown} />
        </div>
      )}

      {notes.length > 0 && (
        <div className="card">
          <div className="sec-h">
            <span className="n">08</span>
            <h2>Notas y consideraciones</h2>
          </div>
          <ul className="requirements">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

const CAMPO_LABELS: Record<CampoCorregible, string> = {
  derecho_importacion_pct: "Derecho de Importación",
  tasa_estadistica_pct: "Tasa Estadística",
  iva_pct: "IVA",
  iva_adicional_pct: "IVA adicional (percepción)",
  ganancias_pct: "Ganancias (percepción)",
};

/** Campo -> columna de aranceles_overrides que puede promoverse a "regla
 * futura" (fase 5.4). IVA adicional y Ganancias no tienen columna propia en
 * el override (se derivan de iva/iva_reducido, o no están en el schema). */
const CAMPO_A_OVERRIDE_FIELD: Partial<Record<CampoCorregible, keyof Pick<OverrideIn, "die_aec" | "tasa_estadistica" | "iva">>> = {
  derecho_importacion_pct: "die_aec",
  tasa_estadistica_pct: "tasa_estadistica",
  iva_pct: "iva",
};

/** Fase 5.4 — "Reclasificar" (cualquier usuario) y "Corregir número" +
 * "Aplicar a futuras" (solo superadmin), sobre la clasificación primaria de
 * la cotización en vivo. Solo se muestra cuando el caller (CotizadorPage)
 * pasa `editable` — el historial no lo pasa, así que ahí no aparece. */
function ClasificacionActions({
  result,
  primary,
  editable,
}: {
  result: AnalyzeResponse;
  primary: Classification;
  editable: EditableCtx;
}) {
  const { role } = useRole();
  const [mode, setMode] = useState<"none" | "reclasificar" | "corregir">("none");
  const [ncmInput, setNcmInput] = useState("");
  const [campo, setCampo] = useState<CampoCorregible>("derecho_importacion_pct");
  const [valor, setValor] = useState<string>("");
  const [aplicarFuturas, setAplicarFuturas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    setMode("none");
    setError(null);
    setNcmInput("");
    setValor("");
    setAplicarFuturas(false);
  }

  async function onSubmitReclasificar() {
    setBusy(true);
    setError(null);
    try {
      const r = await reclasificar({
        ncm: ncmInput,
        producto: result.product?.identified_name ?? primary.description,
        cif: editable.cif,
      });
      editable.onUpdated(r);
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitCorregir() {
    if (!result.cotizacion_id) {
      setError("Esta cotización todavía no se guardó en el historial; no se puede corregir.");
      return;
    }
    const num = parseFloat(valor);
    if (Number.isNaN(num)) {
      setError("Ingresá un número válido.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await ajusteManual(result.cotizacion_id, campo, num);
      const resultado = updated.resultado as AnalyzeResponse;
      editable.onUpdated({
        ...resultado,
        cotizacion_id: updated.id,
        cotizacion_created_at: updated.created_at,
      });

      const overrideField = CAMPO_A_OVERRIDE_FIELD[campo];
      if (aplicarFuturas && overrideField) {
        await upsertOverride(primary.ncm, {
          die_aec: null,
          tasa_estadistica: null,
          iva: null,
          iva_reducido: null,
          nota: `Promovido desde corrección puntual de la cotización ${result.cotizacion_id}.`,
          vigencia: null,
          [overrideField]: num,
        } as OverrideIn);
      }
      cerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const puedePromover = CAMPO_A_OVERRIDE_FIELD[campo] !== undefined;

  return (
    <div style={{ marginTop: 18 }}>
      {mode === "none" && (
        <div className="row gap8 wrapf">
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: "0 0 auto" }}
            onClick={() => setMode("reclasificar")}
          >
            Reclasificar
          </button>
          {role === "superadmin" && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: "0 0 auto" }}
              onClick={() => setMode("corregir")}
            >
              Corregir número
            </button>
          )}
        </div>
      )}

      {mode === "reclasificar" && (
        <div className="note-box">
          <label htmlFor="reclas-ncm">Nuevo NCM</label>
          <div className="row gap8" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <input
                id="reclas-ncm"
                value={ncmInput}
                onChange={(e) => setNcmInput(e.target.value)}
                placeholder="8516.79.90"
              />
            </div>
            <button className="btn" style={{ flex: "0 0 auto" }} disabled={busy} onClick={onSubmitReclasificar}>
              {busy ? "Reclasificando..." : "Confirmar"}
            </button>
            <button className="btn btn-secondary" style={{ flex: "0 0 auto" }} disabled={busy} onClick={cerrar}>
              Cancelar
            </button>
          </div>
          <div className="hint">
            Se busca ese NCM en la base oficial (+ overrides) y se recalcula el costo. Queda guardado
            como una cotización nueva en el historial.
          </div>
          {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
        </div>
      )}

      {mode === "corregir" && (
        <div className="note-box">
          <div className="grid grid-3">
            <div>
              <label htmlFor="corr-campo">Campo</label>
              <select
                id="corr-campo"
                value={campo}
                onChange={(e) => setCampo(e.target.value as CampoCorregible)}
              >
                {(Object.keys(CAMPO_LABELS) as CampoCorregible[]).map((c) => (
                  <option key={c} value={c}>
                    {CAMPO_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="corr-valor">Nuevo valor (%)</label>
              <input
                id="corr-valor"
                type="number"
                step={0.1}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
          </div>
          {puedePromover && (
            <div className="row gap8" style={{ marginTop: 14 }}>
              <input
                id="corr-futuras"
                type="checkbox"
                checked={aplicarFuturas}
                onChange={(e) => setAplicarFuturas(e.target.checked)}
              />
              <label htmlFor="corr-futuras" style={{ marginBottom: 0 }}>
                Aplicar también a futuras cotizaciones de este NCM ({primary.ncm})
              </label>
            </div>
          )}
          <div className="button-row" style={{ marginTop: 14 }}>
            <button className="btn" disabled={busy || valor === ""} onClick={onSubmitCorregir}>
              {busy ? "Guardando..." : "Confirmar corrección"}
            </button>
            <button className="btn btn-secondary" disabled={busy} onClick={cerrar}>
              Cancelar
            </button>
          </div>
          <div className="hint">
            Esta corrección afecta SOLO a esta cotización, salvo que marques "aplicar a futuras".
          </div>
          {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

/** Marca subtle para un valor que viene de un override o de una corrección
 * manual (fase 5.4): asterisco sutil junto al número, NO un badge de color
 * nuevo — la aclaración va una sola vez al pie de la sección (ver
 * AjusteFootnote). */
function AjusteAsterisco() {
  return (
    <span className="ajuste-asterisco" title="Valor ajustado por Tailwind — ver aclaración al pie.">
      {" "}
      *
    </span>
  );
}

function AjusteFootnote({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <p className="hint ajuste-footnote">* Valor ajustado por Tailwind.</p>;
}

function SourceTag({ source }: { source: RateFieldSource }) {
  if (source === "ajuste") return null;
  if (source === "base_oficial") {
    return <span className="src-tag src-base">Base oficial</span>;
  }
  if (source === "verificar") {
    return (
      <span
        className="src-tag src-verificar"
        title="Este dato no está informado en la base oficial para esta posición; se usa el estimado por IA."
      >
        Sin dato en base — verificar
      </span>
    );
  }
  return <span className="src-tag src-ia">Estimado por IA — verificar</span>;
}

function Tf({
  label,
  v,
  color,
  source,
}: {
  label: string;
  v: number;
  color: "v-navy" | "v-gold" | "v-burg";
  source: RateFieldSource;
}) {
  return (
    <div className="tf">
      <span className="k">{label}</span>
      <span className={`v ${color}`}>
        {Number(v).toFixed(1)}%{source === "ajuste" && <AjusteAsterisco />}
      </span>
      <br />
      <SourceTag source={source} />
    </div>
  );
}

function AltClassification({ c }: { c: Classification }) {
  return (
    <div>
      <div className="hs-line">
        <span className="badge alt">Alternativa</span>
        <div style={{ flex: 1 }}>
          <div className="hs-code">{c.ncm}</div>
          <div className="hs-desc">{c.description}</div>
        </div>
        <Badge p={c.probability} />
      </div>
      {c.rationale && (
        <div className="hs-desc" style={{ marginBottom: 6 }}>
          {c.rationale}
        </div>
      )}
      <div className="kv-row">
        <Kv label="DI" v={c.rates.derecho_importacion_pct} cls="die" source={c.rates_source.derecho_importacion} />
        <Kv label="Tasa" v={c.rates.tasa_estadistica_pct} cls="te" source={c.rates_source.tasa_estadistica} />
        <Kv label="IVA" v={c.rates.iva_pct} cls="iva" source={c.rates_source.iva} />
        <Kv label="IVA adic." v={c.rates.iva_adicional_pct} cls="die" source={c.rates_source.iva_adicional} />
        <Kv label="Ganancias" v={c.rates.ganancias_pct} cls="te" source={c.rates_source.ganancias} />
      </div>
      {c.nota_base && (
        <div className="hs-desc" style={{ marginTop: 6 }}>
          <strong>Nota de la base oficial:</strong> {c.nota_base}
        </div>
      )}
      <AjusteFootnote visible={Object.values(c.rates_source).some((s) => s === "ajuste")} />
      {c.requirements && c.requirements.length > 0 && (
        <>
          <div className="subhead">Requisitos</div>
          <ul className="requirements">
            {c.requirements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Kv({
  label,
  v,
  cls,
  source,
}: {
  label: string;
  v: number;
  cls: "die" | "te" | "iva";
  source: RateFieldSource;
}) {
  return (
    <span className="kv">
      <span className="kv-label">{label} </span>
      <b className={cls}>
        {Number(v).toFixed(1)}%{source === "ajuste" && <AjusteAsterisco />}
      </b>{" "}
      <SourceTag source={source} />
    </span>
  );
}

function CostTable({ b }: { b: CostBreakdown }) {
  const fmt = (n: number) =>
    `${b.currency} ${n.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  return (
    <>
      <table className="cost-table">
        <tbody>
          <tr>
            <td>Valor CIF</td>
            <td>{fmt(b.cif_value)}</td>
          </tr>
          <tr>
            <td>+ Derecho de Importación</td>
            <td>{fmt(b.derecho_importacion)}</td>
          </tr>
          <tr>
            <td>+ Tasa de Estadística</td>
            <td>{fmt(b.tasa_estadistica)}</td>
          </tr>
          <tr className="subtotal">
            <td>Base imponible IVA (CIF + DI + Tasa)</td>
            <td>{fmt(b.base_iva)}</td>
          </tr>
          <tr>
            <td>+ IVA</td>
            <td>{fmt(b.iva)}</td>
          </tr>
          <tr>
            <td>+ IVA adicional (percepción)</td>
            <td>{fmt(b.iva_adicional)}</td>
          </tr>
          <tr>
            <td>+ Ganancias (percepción)</td>
            <td>{fmt(b.ganancias)}</td>
          </tr>
          <tr>
            <td>+ Ingresos Brutos (percepción)</td>
            <td>{fmt(b.iibb)}</td>
          </tr>
          <tr className="subtotal">
            <td>Costo de mercadería (CIF + DI + Tasa)</td>
            <td>{fmt(b.costo_mercaderia)}</td>
          </tr>
          <tr className="subtotal">
            <td>Desembolso aduana sin percepciones</td>
            <td>{fmt(b.desembolso_aduana_sin_percepciones)}</td>
          </tr>
          <tr className="subtotal">
            <td>Desembolso aduana total</td>
            <td>{fmt(b.desembolso_aduana_total)}</td>
          </tr>
          <tr className="total">
            <td>Costo landed estimado</td>
            <td>{fmt(b.landed_cost)}</td>
          </tr>
        </tbody>
      </table>
      {b.notas.length > 0 && (
        <>
          <div className="subhead">Notas del cálculo</div>
          <ul className="requirements">
            {b.notas.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
