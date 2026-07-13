import { useEffect, useState } from "react";
import { deleteOverride, getOverride, listOverrides, upsertOverride } from "./api";
import type { OverrideOut } from "./types";

function emptyForm(ncm: string): OverrideOut {
  return {
    ncm,
    die_aec: null,
    tasa_estadistica: null,
    iva: null,
    iva_reducido: null,
    nota: null,
    vigencia: null,
    editado_por: null,
    updated_at: null,
  };
}

function normalizeNcm(raw: string): string {
  return raw.replace(/\D/g, "");
}

export default function AdminAranceles() {
  const [items, setItems] = useState<OverrideOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<OverrideOut | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function reload() {
    listOverrides()
      .then((r) => setItems(r.items))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(reload, []);

  async function onBuscar() {
    const ncm = normalizeNcm(search);
    if (ncm.length !== 8) {
      setSaveError("El NCM debe tener 8 dígitos.");
      return;
    }
    setSaveError(null);
    try {
      const existing = await getOverride(ncm);
      setForm(existing);
    } catch {
      setForm(emptyForm(ncm));
    }
  }

  function onEditar(o: OverrideOut) {
    setForm(o);
    setSaveError(null);
  }

  async function onGuardar() {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await upsertOverride(form.ncm, {
        die_aec: form.die_aec,
        tasa_estadistica: form.tasa_estadistica,
        iva: form.iva,
        iva_reducido: form.iva_reducido,
        nota: form.nota,
        vigencia: form.vigencia,
      });
      setForm(saved);
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onBorrar() {
    if (!form) return;
    if (!window.confirm(`¿Borrar el override del NCM ${form.ncm}? Volverá a regir la base oficial.`)) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await deleteOverride(form.ncm);
      setForm(null);
      reload();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const isNew = form && !items?.some((i) => i.ncm === form.ncm);

  return (
    <div>
      <div className="alert alert-warning">
        Los cambios acá afectan a <strong>todas las cotizaciones futuras</strong> para ese NCM (y a las
        correcciones puntuales que se "apliquen a futuras" desde el historial). No modifican
        cotizaciones ya guardadas.
      </div>

      <div className="card">
        <div className="sec-h">
          <span className="n">01</span>
          <h2>Buscar / agregar override por NCM</h2>
        </div>
        <div className="row gap12" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="ov-search">NCM (8 dígitos)</label>
            <input
              id="ov-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="8516.79.90"
            />
          </div>
          <button className="btn" style={{ flex: "0 0 auto" }} onClick={onBuscar}>
            Buscar
          </button>
        </div>
      </div>

      {form && (
        <div className="card">
          <div className="sec-h">
            <span className="n">02</span>
            <h2>
              {isNew ? "Nuevo override" : "Editar override"} — {form.ncm}
            </h2>
          </div>
          <div className="grid grid-3">
            <div>
              <label htmlFor="ov-die">Derecho de Importación (%)</label>
              <input
                id="ov-die"
                type="number"
                step={0.1}
                value={form.die_aec ?? ""}
                placeholder="(sin cambio — usa la base)"
                onChange={(e) =>
                  setForm({ ...form, die_aec: e.target.value === "" ? null : parseFloat(e.target.value) })
                }
              />
            </div>
            <div>
              <label htmlFor="ov-tasa">Tasa Estadística (%)</label>
              <input
                id="ov-tasa"
                type="number"
                step={0.1}
                value={form.tasa_estadistica ?? ""}
                placeholder="(sin cambio — usa la base)"
                onChange={(e) =>
                  setForm({
                    ...form,
                    tasa_estadistica: e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label htmlFor="ov-iva">IVA (%)</label>
              <input
                id="ov-iva"
                type="number"
                step={0.1}
                value={form.iva ?? ""}
                placeholder="(sin cambio — usa la base)"
                onChange={(e) =>
                  setForm({ ...form, iva: e.target.value === "" ? null : parseFloat(e.target.value) })
                }
              />
            </div>
          </div>

          <div className="row gap8" style={{ marginTop: 14 }}>
            <input
              id="ov-iva-red"
              type="checkbox"
              checked={form.iva_reducido === true}
              onChange={(e) => setForm({ ...form, iva_reducido: e.target.checked })}
            />
            <label htmlFor="ov-iva-red" style={{ marginBottom: 0 }}>
              IVA reducido (afecta la percepción de IVA adicional: 10% en vez de 20%)
            </label>
          </div>

          <div className="grid grid-3" style={{ marginTop: 14 }}>
            <div>
              <label htmlFor="ov-nota">Nota interna</label>
              <input
                id="ov-nota"
                value={form.nota ?? ""}
                onChange={(e) => setForm({ ...form, nota: e.target.value || null })}
                placeholder="Motivo del ajuste"
              />
            </div>
            <div>
              <label htmlFor="ov-vigencia">Vigencia</label>
              <input
                id="ov-vigencia"
                value={form.vigencia ?? ""}
                onChange={(e) => setForm({ ...form, vigencia: e.target.value || null })}
                placeholder="Ej: desde jul-2026"
              />
            </div>
          </div>

          {!isNew && (
            <div className="hint" style={{ marginTop: 10 }}>
              Editado por {form.editado_por ?? "—"} · {form.updated_at ?? "—"}
            </div>
          )}

          {saveError && (
            <div className="alert alert-error" style={{ marginTop: 14 }}>
              {saveError}
            </div>
          )}

          <div className="button-row" style={{ marginTop: 18 }}>
            <button className="btn" disabled={saving} onClick={onGuardar}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
            {!isNew && (
              <button className="btn btn-secondary" disabled={saving} onClick={onBorrar}>
                Borrar override
              </button>
            )}
            <button className="btn btn-secondary" disabled={saving} onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="sec-h" style={{ padding: "20px 20px 0" }}>
          <span className="n">03</span>
          <h2>Overrides cargados ({items?.length ?? "..."})</h2>
        </div>
        {error && (
          <div className="alert alert-error" style={{ margin: 20 }}>
            {error}
          </div>
        )}
        {items && items.length === 0 && (
          <p className="hint" style={{ padding: 20 }}>
            Todavía no hay overrides cargados.
          </p>
        )}
        {items && items.length > 0 && (
          <div className="hist-list">
            {items.map((o) => (
              <button key={o.ncm} type="button" className="hist-row" onClick={() => onEditar(o)}>
                <span className="hist-ncm">{o.ncm}</span>
                <span className="hist-producto-col">
                  <span className="hist-producto">{o.nota ?? "(sin nota)"}</span>
                  <span className="hist-entrada">
                    DIE {o.die_aec ?? "—"} · Tasa {o.tasa_estadistica ?? "—"} · IVA {o.iva ?? "—"}
                  </span>
                </span>
                <span className="hist-fecha">{o.editado_por ?? "—"}</span>
                <span className="badge alt">Editar</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
