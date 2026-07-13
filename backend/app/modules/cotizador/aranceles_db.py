import csv
import logging
import os
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import httpx
from pydantic import BaseModel

from ...core.supabase_rest import rest_headers, table_url

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "aranceles_base_3b.csv")

VIGENCIA_BASE = "Base NCM feb-2023 + correcciones 2026"

_DIGITS_RE = re.compile(r"\D")

logger = logging.getLogger("aranceles")


class ArancelEntry(BaseModel):
    ncm: str
    descripcion: str
    die_aec: Optional[float] = None
    tasa_estadistica: float
    iva: float
    iva_reducido: bool
    bk_bit: Optional[str] = None
    nota: Optional[str] = None


def normalize_ncm(raw: str) -> str:
    """Strip dots/spaces from an NCM code, keeping only digits."""
    return _DIGITS_RE.sub("", raw or "")


def _parse_bool(raw: str) -> bool:
    return raw.strip().lower() in ("true", "1", "si", "sí")


def load_aranceles(path: str = DATA_PATH) -> Dict[str, ArancelEntry]:
    """Load the seed tariff CSV into a dict keyed by normalized 8-digit NCM.

    Missing file or malformed rows are skipped silently — the crossing logic
    in main.py already falls back to the AI-estimated values when a code
    isn't found in the base.
    """
    db: Dict[str, ArancelEntry] = {}
    if not os.path.exists(path):
        logger.warning("Aranceles: no se encontró el CSV en %s; todo cae a estimado_ia.", path)
        return db

    with open(path, newline="", encoding="utf-8") as f:
        lines = [ln for ln in f if not ln.lstrip().startswith("#")]
    reader = csv.DictReader(lines)
    for row in reader:
        raw_ncm = (row.get("ncm") or "").strip()
        if not raw_ncm:
            continue
        code = normalize_ncm(raw_ncm)
        if len(code) != 8:
            continue
        raw_die = (row.get("die_aec") or "").strip()
        try:
            die_aec = float(raw_die) if raw_die else None
        except ValueError:
            die_aec = None
        try:
            entry = ArancelEntry(
                ncm=code,
                descripcion=(row.get("descripcion") or "").strip(),
                die_aec=die_aec,
                tasa_estadistica=float(row["tasa_estadistica"]),
                iva=float(row["iva"]),
                iva_reducido=_parse_bool(row.get("iva_reducido") or ""),
                bk_bit=(row.get("bk_bit") or "").strip() or None,
                nota=(row.get("nota") or "").strip() or None,
            )
        except (KeyError, ValueError):
            continue
        db[code] = entry

    if db:
        logger.info("Aranceles: %d filas cargadas desde %s", len(db), path)
    else:
        logger.warning("Aranceles: el CSV en %s no tiene filas válidas; todo cae a estimado_ia.", path)
    return db


ARANCELES_DB: Dict[str, ArancelEntry] = load_aranceles()


def lookup_ncm(raw_code: str) -> Optional[ArancelEntry]:
    code = normalize_ncm(raw_code)
    if len(code) < 8:
        return None
    return ARANCELES_DB.get(code[:8])


def format_ncm(raw_code: str) -> str:
    """8 dígitos normalizados -> 'XXXX.XX.XX'. Devuelve el input tal cual si no
    tiene 8 dígitos (no debería pasar con NCMs de la base)."""
    code = normalize_ncm(raw_code)
    if len(code) != 8:
        return raw_code
    return f"{code[0:4]}.{code[4:6]}.{code[6:8]}"


# ---------------------------------------------------------------------------
# Overrides (Fase 5.4) — capa administrable ENCIMA de la base del repo.
#
# public.aranceles_overrides: por NCM, los campos no nulos pisan a la base
# (die_aec/tasa_estadistica/iva/iva_reducido); los nulos caen a la base. Se
# cachean en memoria (ARANCELES_DB ya es un dict cargado una vez al importar,
# mismo patrón) y se refrescan explícitamente al escribir (refresh_overrides),
# no por TTL — a diferencia de gemini_prompts/acceso_emails, que sí necesitan
# TTL por consultarse en cada request; los overrides solo se leen al cruzar
# una clasificación, y ese cruce ya toca esta cache en cada /analyze.
# ---------------------------------------------------------------------------

OVERRIDES_TABLE = "aranceles_overrides"


class OverrideEntry(BaseModel):
    ncm: str
    die_aec: Optional[float] = None
    tasa_estadistica: Optional[float] = None
    iva: Optional[float] = None
    iva_reducido: Optional[bool] = None
    nota: Optional[str] = None
    vigencia: Optional[str] = None
    editado_por: Optional[str] = None
    updated_at: Optional[str] = None


def _overrides_require_config() -> None:
    from ...core.config import SUPABASE_SECRET_KEY, SUPABASE_URL

    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError("SUPABASE_URL/SUPABASE_SECRET_KEY no configuradas.")


def _load_overrides() -> Dict[str, OverrideEntry]:
    _overrides_require_config()
    resp = httpx.get(table_url(OVERRIDES_TABLE), headers=rest_headers(), timeout=10)
    resp.raise_for_status()
    db: Dict[str, OverrideEntry] = {}
    for row in resp.json():
        try:
            entry = OverrideEntry(**row)
        except Exception:
            continue
        db[normalize_ncm(entry.ncm)] = entry
    return db


def _load_overrides_safe() -> Dict[str, OverrideEntry]:
    try:
        db = _load_overrides()
        logger.info("Overrides de aranceles: %d filas cargadas.", len(db))
        return db
    except Exception:
        logger.warning("No se pudo cargar aranceles_overrides; se sigue solo con la base.")
        return {}


OVERRIDES_DB: Dict[str, OverrideEntry] = _load_overrides_safe()


def refresh_overrides() -> None:
    """Recarga OVERRIDES_DB desde Supabase. Se llama tras cada escritura
    (PUT/DELETE) en /api/admin/overrides para que el cruce del cotizador vea
    el cambio de inmediato."""
    global OVERRIDES_DB
    OVERRIDES_DB = _load_overrides_safe()


def list_overrides() -> List[OverrideEntry]:
    return sorted(OVERRIDES_DB.values(), key=lambda e: e.ncm)


def get_override(raw_ncm: str) -> Optional[OverrideEntry]:
    return OVERRIDES_DB.get(normalize_ncm(raw_ncm))


def upsert_override(
    ncm: str,
    *,
    die_aec: Optional[float],
    tasa_estadistica: Optional[float],
    iva: Optional[float],
    iva_reducido: Optional[bool],
    nota: Optional[str],
    vigencia: Optional[str],
    editado_por: str,
) -> OverrideEntry:
    _overrides_require_config()
    code = normalize_ncm(ncm)
    row = {
        "ncm": code,
        "die_aec": die_aec,
        "tasa_estadistica": tasa_estadistica,
        "iva": iva,
        "iva_reducido": iva_reducido,
        "nota": nota,
        "vigencia": vigencia,
        "editado_por": editado_por,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = httpx.post(
        table_url(OVERRIDES_TABLE),
        headers=rest_headers(Prefer="resolution=merge-duplicates,return=representation"),
        params={"on_conflict": "ncm"},
        json=row,
        timeout=10,
    )
    resp.raise_for_status()
    refresh_overrides()
    return OverrideEntry(**resp.json()[0])


def delete_override(raw_ncm: str) -> None:
    _overrides_require_config()
    code = normalize_ncm(raw_ncm)
    resp = httpx.delete(
        table_url(OVERRIDES_TABLE),
        headers=rest_headers(),
        params={"ncm": f"eq.{code}"},
        timeout=10,
    )
    resp.raise_for_status()
    refresh_overrides()


def resolve_ncm(raw_code: str) -> Optional[Tuple[ArancelEntry, Dict[str, bool]]]:
    """Cruza un NCM contra la base + la capa de overrides. Devuelve (entry
    fusionada, campos_ajustados) donde campos_ajustados marca con True los
    campos de `entry` que vinieron del override en vez de la base — el caller
    (router._apply_base_rates) usa eso para marcar rates_source='ajuste' campo
    por campo. None si el NCM no está ni en la base ni tiene override propio
    con datos completos (hoy: siempre requiere estar en la base, ya que
    tasa_estadistica/iva no son opcionales en ArancelEntry)."""
    entry = lookup_ncm(raw_code)
    if entry is None:
        return None
    override = get_override(raw_code)
    if override is None:
        return entry, {}

    updates: Dict[str, object] = {}
    ajustados: Dict[str, bool] = {}
    if override.die_aec is not None:
        updates["die_aec"] = override.die_aec
        ajustados["die_aec"] = True
    if override.tasa_estadistica is not None:
        updates["tasa_estadistica"] = override.tasa_estadistica
        ajustados["tasa_estadistica"] = True
    if override.iva is not None:
        updates["iva"] = override.iva
        ajustados["iva"] = True
    if override.iva_reducido is not None:
        updates["iva_reducido"] = override.iva_reducido
        ajustados["iva_reducido"] = True

    merged = entry.model_copy(update=updates) if updates else entry
    return merged, ajustados
