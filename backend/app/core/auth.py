"""Shared auth dependency: validates a Supabase-issued JWT via the project's JWKS,
then checks the token's email against the ALLOWED_EMAIL_DOMAINS/ALLOWED_EMAILS
allowlist (Fase 5.1 — defensa en profundidad, además del auto-registro deshabilitado
en el panel de Supabase) and against public.acceso_emails (Fase 5.4 — allow/deny
por email administrable desde el panel; deny gana sobre cualquier otra regla).

Reusable across every module's router — a module just adds
`Depends(get_current_user)` (or a router-level `dependencies=[...]`) to require
a logged-in, authorized user.
"""

import logging
import time
from functools import lru_cache
from typing import Dict, Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from .config import ALLOWED_EMAIL_DOMAINS, ALLOWED_EMAILS, SUPABASE_URL
from .supabase_rest import rest_headers, table_url

ALGORITHMS = ["ES256", "RS256"]

_bearer_scheme = HTTPBearer(auto_error=False)
_logger = logging.getLogger(__name__)

if not ALLOWED_EMAIL_DOMAINS and not ALLOWED_EMAILS:
    _logger.warning(
        "ALLOWED_EMAIL_DOMAINS / ALLOWED_EMAILS no están configuradas: la allowlist de "
        "acceso está deshabilitada y cualquier usuario autenticado en Supabase puede "
        "entrar. Configurá estas variables en producción."
    )

# Cache en memoria de public.acceso_emails (email -> permitido), con TTL corto:
# esta tabla se consulta en get_current_user, es decir en cada request, así que
# no puede pegarle a Supabase por request. Si la carga falla (Supabase caído,
# tabla recién creada, etc.) se degrada a solo la allowlist de env vars — no
# rompe el flujo actual.
_ACCESO_CACHE_TTL_S = 60.0
_acceso_cache: Dict[str, bool] = {}
_acceso_cache_at: float = 0.0


def _load_acceso_emails() -> Dict[str, bool]:
    resp = httpx.get(
        table_url("acceso_emails"),
        headers=rest_headers(),
        params={"select": "email,permitido"},
        timeout=5,
    )
    resp.raise_for_status()
    return {row["email"].lower(): bool(row["permitido"]) for row in resp.json()}


def _acceso_override(email: str) -> Optional[bool]:
    """True/False si el email tiene una fila explícita en acceso_emails; None si
    no hay fila (o si no se pudo consultar la tabla)."""
    global _acceso_cache, _acceso_cache_at
    now = time.time()
    if now - _acceso_cache_at > _ACCESO_CACHE_TTL_S:
        try:
            _acceso_cache = _load_acceso_emails()
            _acceso_cache_at = now
        except Exception:
            _logger.warning("No se pudo leer acceso_emails; se usa solo la allowlist de env.")
    return _acceso_cache.get(email)


def invalidate_acceso_cache() -> None:
    """Llamado por el endpoint admin tras un allow/deny nuevo, para que el
    cambio rija de inmediato en vez de esperar el TTL."""
    global _acceso_cache_at
    _acceso_cache_at = 0.0


def _email_autorizado(email: Optional[str]) -> bool:
    if not email:
        return False
    email = email.lower()

    override = _acceso_override(email)
    if override is False:
        return False  # deny explícito gana sobre cualquier otra regla
    if override is True:
        return True

    if not ALLOWED_EMAIL_DOMAINS and not ALLOWED_EMAILS:
        return True
    if email in ALLOWED_EMAILS:
        return True
    return any(email.endswith(f"@{domain}") for domain in ALLOWED_EMAIL_DOMAINS)


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    if not SUPABASE_URL:
        raise RuntimeError(
            "SUPABASE_URL no está configurada. Copiá backend/.env.example a "
            "backend/.env y completá los valores del proyecto Supabase."
        )
    jwks_url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    # PyJWKClient caches fetched keys in-process (cache_keys=True), avoiding a
    # network round-trip to Supabase on every request.
    return PyJWKClient(jwks_url, cache_keys=True)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> dict:
    """FastAPI dependency: requires a valid `Authorization: Bearer <token>` header
    whose email is on the allowlist.

    Returns the decoded JWT payload (contains `sub`, `email`, etc.) on success;
    raises 401 if the header is missing or the token doesn't verify, or 403
    (`{"detail": "email_no_autorizado"}`) if the email isn't allowed.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token de autenticación.")

    token = credentials.credentials
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=ALGORITHMS,
            audience="authenticated",
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Token inválido: {e}")

    if not _email_autorizado(payload.get("email")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "email_no_autorizado")

    return payload
