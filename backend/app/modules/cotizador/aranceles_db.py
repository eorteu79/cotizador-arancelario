import csv
import logging
import os
import re
from typing import Dict, Optional

from pydantic import BaseModel

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
