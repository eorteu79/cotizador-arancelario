import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Fase 5.1 — allowlist de acceso (defensa en profundidad además del auto-registro
# deshabilitado en Supabase). Comparación case-insensitive; dominios sin "@".
ALLOWED_EMAIL_DOMAINS = [
    d.strip().lower().lstrip("@")
    for d in os.environ.get("ALLOWED_EMAIL_DOMAINS", "").split(",")
    if d.strip()
]
ALLOWED_EMAILS = [
    e.strip().lower() for e in os.environ.get("ALLOWED_EMAILS", "").split(",") if e.strip()
]
