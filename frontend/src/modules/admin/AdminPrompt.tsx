import { useEffect, useState } from "react";
import { activarPromptVersion, createPromptVersion, getPromptState } from "./api";
import type { PromptStateResponse } from "./types";

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

export default function AdminPrompt() {
  const [state, setState] = useState<PromptStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contenido, setContenido] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activandoId, setActivandoId] = useState<string | null>(null);

  function reload() {
    getPromptState()
      .then((r) => {
        setState(r);
        setContenido(r.activo.contenido);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(reload, []);

  const dirty = state !== null && contenido !== state.activo.contenido;

  async function onGuardar() {
    setSaving(true);
    setSaveError(null);
    try {
      await createPromptVersion(contenido);
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onActivar(id: string) {
    setActivandoId(id);
    setSaveError(null);
    try {
      await activarPromptVersion(id);
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setActivandoId(null);
    }
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!state) {
    return (
      <div className="loader">
        <div className="spinner" />
        <span>Cargando prompt...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="sec-h">
          <span className="n">01</span>
          <h2>
            Prompt activo — versión {state.activo.version}
          </h2>
        </div>
        <textarea
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          style={{ minHeight: 420, fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12.5 }}
        />
        <div className="hint">
          Guardar crea una <strong>versión nueva</strong> (no sobrescribe la actual) y la activa de
          inmediato. Podés volver a una versión anterior con "Activar" en la lista de abajo.
        </div>

        {saveError && (
          <div className="alert alert-error" style={{ marginTop: 14 }}>
            {saveError}
          </div>
        )}

        <div className="button-row" style={{ marginTop: 16 }}>
          <button className="btn" disabled={!dirty || saving} onClick={onGuardar}>
            {saving ? "Guardando..." : "Guardar como nueva versión"}
          </button>
          {dirty && (
            <button
              className="btn btn-secondary"
              disabled={saving}
              onClick={() => setContenido(state.activo.contenido)}
            >
              Descartar cambios
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="sec-h" style={{ padding: "20px 20px 0" }}>
          <span className="n">02</span>
          <h2>Historial de versiones</h2>
        </div>
        <div className="hist-list">
          {state.versiones.map((v) => (
            <div key={v.id} className="hist-row" style={{ cursor: "default" }}>
              <span className="hist-ncm">v{v.version}</span>
              <span className="hist-producto-col">
                <span className="hist-producto">{v.created_by ?? "—"}</span>
                <span className="hist-entrada">{fmtFecha(v.created_at)}</span>
              </span>
              <span>
                {v.activo ? (
                  <span className="src-tag src-base">Activa</span>
                ) : (
                  <span className="hint" style={{ margin: 0 }}>
                    Inactiva
                  </span>
                )}
              </span>
              {!v.activo && (
                <button
                  className="btn btn-secondary"
                  style={{ flex: "0 0 auto", padding: "8px 14px" }}
                  disabled={activandoId !== null}
                  onClick={() => onActivar(v.id)}
                >
                  {activandoId === v.id ? "Activando..." : "Activar"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
