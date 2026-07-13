import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

from .core.access_control import get_role  # noqa: E402
from .core.auth import get_current_user  # noqa: E402
from .core.config import GEMINI_API_KEY  # noqa: E402 (loads .env as a side effect)
from .modules.admin.router import router as admin_router  # noqa: E402
from .modules.cotizador.router import router as cotizador_router  # noqa: E402

app = FastAPI(title="Tailwind Global Commerce — Plataforma")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Each module owns its own router; add new modules here as they're built
# (e.g. app.include_router(proveedores_router, prefix="/api/proveedores")).
app.include_router(cotizador_router, prefix="/api/cotizador", tags=["cotizador"])
app.include_router(admin_router, prefix="/api/admin", tags=["admin"])


@app.get("/api/health")
def health():
    return {
        "ok": True,
        # Field name kept as anthropic_key_configured (frontend contract unchanged
        # by the Gemini migration); it now reflects GEMINI_API_KEY.
        "anthropic_key_configured": bool(GEMINI_API_KEY),
    }


@app.get("/api/auth/whoami")
def whoami(user: dict = Depends(get_current_user)):
    # Reuses get_current_user (allowlist check included) so the frontend can probe
    # authorization right after login instead of waiting for the first module call.
    return {"email": user.get("email")}


@app.get("/api/me/rol")
def mi_rol(user: dict = Depends(get_current_user)):
    """Rol de administración del usuario logueado (Fase 5.4): 'superadmin' |
    'admin' | null (=usuario común). El front usa esto para mostrar/ocultar
    las secciones de /admin."""
    return {"role": get_role(user.get("email"))}
