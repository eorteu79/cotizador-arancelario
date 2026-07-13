"""Fase 5.4 — roles de administración, leídos de public.app_roles.

`get_current_user` (auth.py) ya garantiza un usuario autenticado y con email
autorizado; estas dependencias agregan una capa encima para las secciones de
/admin: 'superadmin' | 'admin' | None (=usuario común, sin acceso a /admin).
"""

import logging
import time
from typing import Dict, Optional

import httpx
from fastapi import Depends, HTTPException, status

from .auth import get_current_user
from .supabase_rest import rest_headers, table_url

_logger = logging.getLogger(__name__)

# Tabla chica, consultada en cada request a /admin/* (y en /api/me/rol): se
# cachea completa en memoria con un TTL corto en vez de pegarle a Supabase por
# request. Si la carga falla, se sirve el cache viejo (o ninguno) y el rol
# efectivo cae a None — un fallo de Supabase no debe habilitar admin de más,
# solo puede negar de más (fail-closed).
_CACHE_TTL_S = 30.0
_roles_cache: Dict[str, str] = {}
_roles_cache_at: float = 0.0


def _load_app_roles() -> Dict[str, str]:
    resp = httpx.get(
        table_url("app_roles"),
        headers=rest_headers(),
        params={"select": "email,role"},
        timeout=5,
    )
    resp.raise_for_status()
    return {row["email"].lower(): row["role"] for row in resp.json()}


def _roles() -> Dict[str, str]:
    global _roles_cache, _roles_cache_at
    now = time.time()
    if now - _roles_cache_at > _CACHE_TTL_S:
        try:
            _roles_cache = _load_app_roles()
            _roles_cache_at = now
        except Exception:
            _logger.warning("No se pudo leer app_roles; se sirve el cache anterior (fail-closed).")
    return _roles_cache


def invalidate_roles_cache() -> None:
    """Llamado tras un alta/baja de rol para que rija de inmediato."""
    global _roles_cache_at
    _roles_cache_at = 0.0


def get_role(email: Optional[str]) -> Optional[str]:
    if not email:
        return None
    return _roles().get(email.lower())


def all_roles() -> Dict[str, str]:
    """Todo el mapa email->role, cacheado (TTL corto) — para /api/admin/usuarios."""
    return dict(_roles())


def fetch_roles_fresh() -> Dict[str, str]:
    """Como all_roles(), pero sin cache — para el chequeo de "no dejar sin
    último superadmin" antes de una baja/downgrade de rol, donde una lectura
    stale sería un error de seguridad, no solo de UX."""
    return _load_app_roles()


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    role = get_role(user.get("email"))
    if role not in ("admin", "superadmin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "requiere_rol_admin")
    return {**user, "role": role}


def require_superadmin(user: dict = Depends(get_current_user)) -> dict:
    role = get_role(user.get("email"))
    if role != "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "requiere_rol_superadmin")
    return {**user, "role": role}
