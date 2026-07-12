"""Shared auth dependency: validates a Supabase-issued JWT via the project's JWKS.

Reusable across every module's router — a module just adds
`Depends(get_current_user)` (or a router-level `dependencies=[...]`) to require
a logged-in user.
"""

from functools import lru_cache
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from .config import SUPABASE_URL

ALGORITHMS = ["ES256", "RS256"]

_bearer_scheme = HTTPBearer(auto_error=False)


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
    """FastAPI dependency: requires a valid `Authorization: Bearer <token>` header.

    Returns the decoded JWT payload (contains `sub`, `email`, etc.) on success;
    raises 401 if the header is missing or the token doesn't verify.
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

    return payload
