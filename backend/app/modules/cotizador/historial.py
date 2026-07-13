"""Historial de cotizaciones (tabla public.cotizaciones), vía REST de Supabase
(PostgREST) con la service key.

La service key bypassea RLS, así que cada lectura acá filtra explícitamente
por user_id — Supabase no lo hace por nosotros en este camino.
"""

from typing import Any, Dict, List, Optional

import httpx

from ...core.config import SUPABASE_SECRET_KEY, SUPABASE_URL

_TABLE_URL = f"{SUPABASE_URL.rstrip('/')}/rest/v1/cotizaciones" if SUPABASE_URL else ""


def _require_config() -> None:
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError("SUPABASE_URL/SUPABASE_SECRET_KEY no configuradas.")


def _headers(**extra: str) -> Dict[str, str]:
    return {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
        **extra,
    }


def guardar_cotizacion(
    *, user_id: str, producto: str, ncm: str, fuente: str, resultado: Dict[str, Any]
) -> Dict[str, Any]:
    """Inserta una fila y devuelve la fila insertada (id y created_at incluidos,
    generados por la base). Deja que la excepción suba — el caller decide si la
    trata como no-fatal (ver router.py: no debe romper la respuesta al usuario)."""
    _require_config()
    row = {
        "user_id": user_id,
        "producto": producto,
        "ncm": ncm,
        "fuente": fuente,
        "resultado": resultado,
    }
    resp = httpx.post(
        _TABLE_URL, headers=_headers(Prefer="return=representation"), json=row, timeout=10
    )
    resp.raise_for_status()
    return resp.json()[0]


def listar_cotizaciones(*, user_id: str, limit: int, offset: int) -> List[Dict[str, Any]]:
    _require_config()
    params = {
        # entrada se extrae del jsonb resultado (PostgREST: alias:columna->path) en
        # vez de traer el resultado completo por fila — la lista solo necesita el
        # resumen + la consulta original, no las clasificaciones/costos.
        "select": "id,created_at,producto,ncm,fuente,entrada:resultado->entrada",
        "user_id": f"eq.{user_id}",
        "order": "created_at.desc",
        "limit": limit,
        "offset": offset,
    }
    resp = httpx.get(_TABLE_URL, headers=_headers(), params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def obtener_cotizacion(*, user_id: str, cotizacion_id: str) -> Optional[Dict[str, Any]]:
    _require_config()
    params = {
        "select": "*",
        "user_id": f"eq.{user_id}",
        "id": f"eq.{cotizacion_id}",
        "limit": 1,
    }
    resp = httpx.get(_TABLE_URL, headers=_headers(), params=params, timeout=10)
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else None


def obtener_cotizacion_admin(*, cotizacion_id: str) -> Optional[Dict[str, Any]]:
    """Como obtener_cotizacion, pero sin filtrar por user_id — solo para la
    corrección puntual a mano (fase 5.4, solo superadmin), que puede corregir
    la cotización de cualquier usuario."""
    _require_config()
    params = {"select": "*", "id": f"eq.{cotizacion_id}", "limit": 1}
    resp = httpx.get(_TABLE_URL, headers=_headers(), params=params, timeout=10)
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else None


def actualizar_cotizacion(
    *, cotizacion_id: str, fuente: Optional[str], resultado: Dict[str, Any]
) -> Dict[str, Any]:
    """Sobrescribe fuente/resultado de una fila ya existente (fase 5.4:
    corrección puntual a mano). A diferencia de guardar_cotizacion (siempre
    inserta fila nueva, preserva historial), esto modifica la MISMA fila."""
    _require_config()
    row: Dict[str, Any] = {"resultado": resultado}
    if fuente is not None:
        row["fuente"] = fuente
    resp = httpx.patch(
        _TABLE_URL,
        headers=_headers(Prefer="return=representation"),
        params={"id": f"eq.{cotizacion_id}"},
        json=row,
        timeout=10,
    )
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        raise RuntimeError("Cotización no encontrada al actualizar.")
    return rows[0]
