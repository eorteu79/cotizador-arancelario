"""Thin shared helper for talking to Supabase's PostgREST API with the service
key (bypasses RLS — every caller is responsible for its own authorization
checks, same convention as modules/cotizador/historial.py).
"""

from typing import Dict

from .config import SUPABASE_SECRET_KEY, SUPABASE_URL


def require_config() -> None:
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError("SUPABASE_URL/SUPABASE_SECRET_KEY no configuradas.")


def table_url(table: str) -> str:
    return f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"


def auth_admin_url(path: str) -> str:
    return f"{SUPABASE_URL.rstrip('/')}/auth/v1/admin/{path.lstrip('/')}"


def rest_headers(**extra: str) -> Dict[str, str]:
    return {
        "apikey": SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
        **extra,
    }
