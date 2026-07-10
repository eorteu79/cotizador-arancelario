import { useEffect, useRef, useState } from "react";
import "./App.css";
import { analyze, health } from "./api";
import type {
  AnalyzeResponse,
  CifInputs,
  Classification,
  ClarificationAnswer,
  CostBreakdown,
  ImporterType,
  Mode,
  Probability,
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
    importer_type: "responsable_inscripto",
    include_percepciones: true,
  };
}

export default function App() {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [cif, setCif] = useState<CifInputs>(defaultCif());
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
      <header className="header">
        <h1>Estimador de costo de importación a Argentina</h1>
        <p>
          Describí el producto (texto, URL, PDF o foto), indicá el valor CIF, y obtené una
          posición arancelaria NCM probable junto con la estimación de aranceles, impuestos y
          costo landed.
        </p>
      </header>

      {keyOk === false && (
        <div className="alert alert-warning">
          <strong>Atención:</strong> No se detectó <code>ANTHROPIC_API_KEY</code> en el backend.
          Configurala en <code>backend/.env</code> y reiniciá el servidor.
        </div>
      )}

      <div className="card">
        <h2>1 · Definí el producto</h2>
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
        <h2>2 · Datos del valor CIF</h2>
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
            Consultando Claude y buscando en la web... (puede tardar 20–60 segundos)
          </span>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {result && result.needs_clarification && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2>Faltan algunos datos</h2>
          <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16 }}>
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
            className="btn"
            disabled={
              loading || Object.values(clarifAnswers).every((v) => !v || !v.trim())
            }
            onClick={onSubmitClarifications}
          >
            Continuar con estas respuestas
          </button>
        </div>
      )}

      {result && !result.needs_clarification && <Results result={result} />}

      <footer className="footer">
        {result?.disclaimer ??
          "Resultados orientativos. Verificá con un despachante antes de operar."}
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
        <label htmlFor="cif-importer">Tipo de importador</label>
        <select
          id="cif-importer"
          value={cif.importer_type}
          onChange={(e) =>
            setCif({ ...cif, importer_type: e.target.value as ImporterType })
          }
        >
          <option value="responsable_inscripto">Responsable Inscripto</option>
          <option value="consumidor_final">Consumidor Final</option>
        </select>
      </div>
      <div className="row-inline" style={{ gridColumn: "1 / -1", marginTop: 4 }}>
        <input
          id="incperc"
          type="checkbox"
          checked={cif.include_percepciones}
          onChange={(e) =>
            setCif({ ...cif, include_percepciones: e.target.checked })
          }
        />
        <label htmlFor="incperc" style={{ marginBottom: 0 }}>
          Incluir percepciones (IVA adicional, Ganancias, IIBB) en el desembolso total
        </label>
      </div>
    </div>
  );
}

function Badge({ p }: { p: Probability }) {
  return <span className={`badge badge-${p}`}>{p}</span>;
}

function Results({ result }: { result: AnalyzeResponse }) {
  const { product, classifications, cost_breakdown, notes } = result;
  return (
    <>
      {product && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2>Producto identificado</h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <strong style={{ fontSize: 17 }}>{product.identified_name}</strong>
            <Badge p={product.confidence} />
          </div>
          <p style={{ fontSize: 14, color: "var(--text-muted)" }}>
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

      {classifications.length > 0 && (
        <div className="card">
          <h2>Clasificación arancelaria (NCM)</h2>
          {classifications.map((c, i) => (
            <NcmCard key={c.ncm + i} c={c} primary={i === 0} />
          ))}
        </div>
      )}

      {cost_breakdown && (
        <div className="card">
          <h2>Estimación de costo landed</h2>
          <CostTable b={cost_breakdown} />
        </div>
      )}

      {notes.length > 0 && (
        <div className="card">
          <h2>Notas y consideraciones</h2>
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

function NcmCard({ c, primary }: { c: Classification; primary: boolean }) {
  return (
    <div className={`ncm-card ${primary ? "primary" : ""}`}>
      <div className="ncm-header">
        <div className="ncm-code">{c.ncm}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {primary && <span className="badge badge-alta">Más probable</span>}
          <Badge p={c.probability} />
        </div>
      </div>
      <div className="ncm-desc">{c.description}</div>
      {c.rationale && <div className="ncm-rationale">{c.rationale}</div>}
      <div className="rates-grid">
        <Rate label="DI" v={c.rates.derecho_importacion_pct} />
        <Rate label="Tasa Estad." v={c.rates.tasa_estadistica_pct} />
        <Rate label="IVA" v={c.rates.iva_pct} />
        <Rate label="IVA adic." v={c.rates.iva_adicional_pct} />
        <Rate label="Ganancias" v={c.rates.ganancias_pct} />
        <Rate label="IIBB" v={c.rates.iibb_pct} />
      </div>
      {c.requirements && c.requirements.length > 0 && (
        <>
          <div className="subhead">Requisitos / cosas a tener en cuenta</div>
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

function Rate({ label, v }: { label: string; v: number }) {
  return (
    <div className="rate">
      <div className="rate-label">{label}</div>
      <div className="rate-value">{Number(v).toFixed(1)}%</div>
    </div>
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
