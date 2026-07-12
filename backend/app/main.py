import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

from .core.config import GEMINI_API_KEY  # noqa: E402 (loads .env as a side effect)
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


@app.get("/api/health")
def health():
    return {
        "ok": True,
        # Field name kept as anthropic_key_configured (frontend contract unchanged
        # by the Gemini migration); it now reflects GEMINI_API_KEY.
        "anthropic_key_configured": bool(GEMINI_API_KEY),
    }
