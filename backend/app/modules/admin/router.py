"""Fase 5.4 — panel de administración: overrides de aranceles, prompt de
Gemini versionado, usuarios/roles/accesos. Todo bajo /api/admin, gateado por
rol (require_admin | require_superadmin) además del login que ya exige el
router-level dependency de abajo.
"""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from ...core.access_control import (
    all_roles,
    fetch_roles_fresh,
    get_role,
    invalidate_roles_cache,
    require_admin,
    require_superadmin,
)
from ...core.auth import get_current_user, invalidate_acceso_cache
from ...core.config import SUPABASE_SECRET_KEY, SUPABASE_URL
from ...core.supabase_rest import auth_admin_url, rest_headers, table_url
from ..cotizador import aranceles_db
from ..cotizador import prompts as prompts_service
from .schemas import (
    AccesoIn,
    AccesoListResponse,
    AccesoOut,
    OverrideIn,
    OverrideOut,
    OverridesListResponse,
    PromptActivo,
    PromptCreateRequest,
    PromptStateResponse,
    PromptVersion,
    RoleIn,
    RoleOut,
    UsuarioOut,
    UsuariosListResponse,
)

router = APIRouter(dependencies=[Depends(get_current_user)])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Overrides de aranceles por NCM (superadmin)
# ---------------------------------------------------------------------------


@router.get("/overrides", response_model=OverridesListResponse)
def listar_overrides(user: dict = Depends(require_superadmin)):
    items = [OverrideOut(**e.model_dump()) for e in aranceles_db.list_overrides()]
    return OverridesListResponse(items=items)


@router.get("/overrides/{ncm}", response_model=OverrideOut)
def obtener_override(ncm: str, user: dict = Depends(require_superadmin)):
    entry = aranceles_db.get_override(ncm)
    if entry is None:
        raise HTTPException(404, "No hay un override cargado para ese NCM.")
    return OverrideOut(**entry.model_dump())


@router.put("/overrides/{ncm}", response_model=OverrideOut)
def upsert_override(ncm: str, req: OverrideIn, user: dict = Depends(require_superadmin)):
    code = aranceles_db.normalize_ncm(ncm)
    if len(code) != 8:
        raise HTTPException(400, "El NCM debe tener 8 dígitos.")
    try:
        entry = aranceles_db.upsert_override(
            code,
            die_aec=req.die_aec,
            tasa_estadistica=req.tasa_estadistica,
            iva=req.iva,
            iva_reducido=req.iva_reducido,
            nota=req.nota,
            vigencia=req.vigencia,
            editado_por=user.get("email"),
        )
    except Exception as e:
        raise HTTPException(502, f"No se pudo guardar el override: {e}")
    return OverrideOut(**entry.model_dump())


@router.delete("/overrides/{ncm}", status_code=204)
def borrar_override(ncm: str, user: dict = Depends(require_superadmin)):
    try:
        aranceles_db.delete_override(ncm)
    except Exception as e:
        raise HTTPException(502, f"No se pudo borrar el override: {e}")


# ---------------------------------------------------------------------------
# 2. Prompt de Gemini versionado (superadmin)
# ---------------------------------------------------------------------------


@router.get("/prompt", response_model=PromptStateResponse)
def obtener_prompt(user: dict = Depends(require_superadmin)):
    try:
        activo = prompts_service.get_active_prompt_row()
        versiones = prompts_service.list_prompt_versions()
    except Exception as e:
        raise HTTPException(502, f"No se pudo leer el prompt: {e}")
    if activo is None:
        raise HTTPException(502, "No hay un prompt activo (ni se pudo sembrar uno).")
    return PromptStateResponse(
        activo=PromptActivo(**activo), versiones=[PromptVersion(**v) for v in versiones]
    )


@router.post("/prompt", response_model=PromptVersion)
def crear_version_prompt(req: PromptCreateRequest, user: dict = Depends(require_superadmin)):
    try:
        row = prompts_service.create_prompt_version(req.contenido, created_by=user.get("email"))
    except Exception as e:
        raise HTTPException(502, f"No se pudo crear la nueva versión: {e}")
    return PromptVersion(**row)


@router.post("/prompt/{prompt_id}/activar", response_model=PromptVersion)
def activar_prompt(prompt_id: str, user: dict = Depends(require_superadmin)):
    try:
        row = prompts_service.activar_prompt_version(prompt_id)
    except RuntimeError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(502, f"No se pudo activar esa versión: {e}")
    return PromptVersion(**row)


# ---------------------------------------------------------------------------
# 3. Usuarios (admin) — Supabase Auth Admin API + join app_roles
# ---------------------------------------------------------------------------


@router.get("/usuarios", response_model=UsuariosListResponse)
def listar_usuarios(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user: dict = Depends(require_admin),
):
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise HTTPException(500, "SUPABASE_URL/SUPABASE_SECRET_KEY no configuradas.")
    try:
        resp = httpx.get(
            auth_admin_url("users"),
            headers=rest_headers(),
            params={"page": page, "per_page": per_page},
            timeout=10,
        )
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"No se pudo leer los usuarios: {e}")

    data = resp.json()
    auth_users = data.get("users", data) if isinstance(data, dict) else data
    roles = all_roles()
    items = [
        UsuarioOut(
            id=u["id"],
            email=u.get("email"),
            created_at=u.get("created_at"),
            last_sign_in_at=u.get("last_sign_in_at"),
            role=roles.get((u.get("email") or "").lower()),
        )
        for u in auth_users
    ]
    return UsuariosListResponse(items=items, page=page, per_page=per_page)


# ---------------------------------------------------------------------------
# 4. Accesos allow/deny (admin)
# ---------------------------------------------------------------------------


@router.get("/acceso", response_model=AccesoListResponse)
def listar_acceso(user: dict = Depends(require_admin)):
    try:
        resp = httpx.get(
            table_url("acceso_emails"),
            headers=rest_headers(),
            params={"select": "*", "order": "created_at.desc"},
            timeout=10,
        )
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"No se pudo leer acceso_emails: {e}")
    return AccesoListResponse(items=[AccesoOut(**r) for r in resp.json()])


@router.post("/acceso", response_model=AccesoOut)
def upsert_acceso(req: AccesoIn, user: dict = Depends(require_admin)):
    row = {
        "email": req.email.lower(),
        "permitido": req.permitido,
        "nota": req.nota,
        "creado_por": user.get("email"),
    }
    try:
        resp = httpx.post(
            table_url("acceso_emails"),
            headers=rest_headers(Prefer="resolution=merge-duplicates,return=representation"),
            params={"on_conflict": "email"},
            json=row,
            timeout=10,
        )
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"No se pudo guardar el acceso: {e}")
    invalidate_acceso_cache()
    return AccesoOut(**resp.json()[0])


@router.delete("/acceso/{email}", status_code=204)
def borrar_acceso(email: str, user: dict = Depends(require_admin)):
    try:
        resp = httpx.delete(
            table_url("acceso_emails"),
            headers=rest_headers(),
            params={"email": f"eq.{email.lower()}"},
            timeout=10,
        )
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"No se pudo borrar el acceso: {e}")
    invalidate_acceso_cache()


# ---------------------------------------------------------------------------
# 5. Roles (solo superadmin) — protege al último superadmin
# ---------------------------------------------------------------------------


def _check_no_deja_sin_superadmin(email: str) -> None:
    roles = fetch_roles_fresh()
    superadmins = [e for e, r in roles.items() if r == "superadmin"]
    if email.lower() in superadmins and len(superadmins) <= 1:
        raise HTTPException(400, "No se puede quitar o degradar al último superadmin.")


@router.post("/roles", response_model=RoleOut)
def asignar_rol(req: RoleIn, user: dict = Depends(require_superadmin)):
    if req.role not in ("admin", "superadmin"):
        raise HTTPException(400, "role debe ser 'admin' o 'superadmin'.")
    email = req.email.lower()
    if req.role != "superadmin" and get_role(email) == "superadmin":
        _check_no_deja_sin_superadmin(email)
    try:
        resp = httpx.post(
            table_url("app_roles"),
            headers=rest_headers(Prefer="resolution=merge-duplicates,return=representation"),
            params={"on_conflict": "email"},
            json={"email": email, "role": req.role},
            timeout=10,
        )
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"No se pudo asignar el rol: {e}")
    invalidate_roles_cache()
    return RoleOut(**resp.json()[0])


@router.delete("/roles/{email}", status_code=204)
def quitar_rol(email: str, user: dict = Depends(require_superadmin)):
    email = email.lower()
    if get_role(email) == "superadmin":
        _check_no_deja_sin_superadmin(email)
    try:
        resp = httpx.delete(
            table_url("app_roles"), headers=rest_headers(), params={"email": f"eq.{email}"}, timeout=10
        )
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(502, f"No se pudo quitar el rol: {e}")
    invalidate_roles_cache()
