import json
import re
import os
import time
from typing import Optional, List, Dict, Any

import httpx
from bs4 import BeautifulSoup
from google import genai
from google.genai import errors, types

from .prompts import get_active_prompt


_client: Optional[genai.Client] = None

MODEL = "gemini-2.5-flash"
MAX_OUTPUT_TOKENS = 16000
URL_FETCH_MAX_CHARS = 30000
USER_AGENT = "Mozilla/5.0 (compatible; ImportCostBot/1.0; +https://localhost)"

RETRYABLE_CODES = {429, 500, 503}
MAX_RETRIES = 3
RETRY_BASE_DELAY_S = 2.0


def get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY no está configurada. Copiá backend/.env.example "
                "a backend/.env y poné tu API key de Gemini (Google AI Studio)."
            )
        _client = genai.Client(api_key=api_key)
    return _client


def fetch_url_text(url: str, max_chars: int = URL_FETCH_MAX_CHARS) -> str:
    """Fetch a URL and extract readable text. Empty string on failure."""
    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=20.0,
            headers={"User-Agent": USER_AGENT},
        ) as h:
            r = h.get(url)
            r.raise_for_status()
            ct = r.headers.get("content-type", "").lower()
            if "html" in ct or "xml" in ct or ct == "":
                soup = BeautifulSoup(r.text, "html.parser")
                for tag in soup(["script", "style", "noscript", "iframe", "svg"]):
                    tag.decompose()
                text = soup.get_text(separator="\n", strip=True)
                lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
                text = "\n".join(lines)
                return text[:max_chars]
            if "text/" in ct or "json" in ct:
                return r.text[:max_chars]
            return ""
    except Exception:
        return ""


def build_user_content(
    mode: str,
    text: Optional[str],
    url: Optional[str],
    pdf_bytes: Optional[bytes],
    image_bytes: Optional[bytes],
    image_media_type: Optional[str],
    clarifications: List[Dict[str, str]],
) -> List[Any]:
    parts: List[Any] = []
    intro = "Necesito clasificar este producto para importarlo a Argentina y estimar costos."

    if mode == "text":
        body = f"{intro}\n\nDescripción del producto:\n{text or ''}"
        parts.append(body)

    elif mode == "url":
        page_text = fetch_url_text(url) if url else ""
        body = f"{intro}\n\nURL del producto: {url}\n"
        if page_text:
            body += (
                "\nContenido extraído de la página (puede estar truncado):\n"
                "```\n" + page_text + "\n```\n"
            )
        else:
            body += (
                "\n(No se pudo extraer texto de la página automáticamente. "
                "Usá la búsqueda web para obtener más información sobre el producto.)\n"
            )
        parts.append(body)

    elif mode == "pdf":
        parts.append(f"{intro}\n\nTe paso la ficha técnica del producto en PDF adjunto.")
        if pdf_bytes:
            parts.append(types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"))

    elif mode == "image":
        parts.append(
            f"{intro}\n\nTe paso una foto del producto. Identificá qué es y qué "
            "características técnicas relevantes podés inferir; usá búsqueda web si necesitás "
            "complementar la información."
        )
        if image_bytes:
            parts.append(
                types.Part.from_bytes(
                    data=image_bytes, mime_type=image_media_type or "image/jpeg"
                )
            )

    else:
        parts.append("(Modo de entrada no soportado)")

    if clarifications:
        lines = ["\nRespuestas a preguntas anteriores de clarificación:"]
        for c in clarifications:
            cid = c.get("id", "")
            ans = c.get("answer", "")
            lines.append(f"- {cid}: {ans}")
        parts.append("\n".join(lines))

    return parts


def call_gemini(parts: List[Any]) -> str:
    """Call Gemini with Google Search grounding enabled. Returns the final text.

    Retries with exponential backoff on transient errors (429 rate limit, 500/503
    server overload) — Gemini Flash regularly returns 503 UNAVAILABLE under demand
    spikes that clear up within seconds.
    """
    client = get_client()
    config = types.GenerateContentConfig(
        system_instruction=get_active_prompt(),
        max_output_tokens=MAX_OUTPUT_TOKENS,
        tools=[types.Tool(google_search=types.GoogleSearch())],
    )

    last_error: Optional[errors.APIError] = None
    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=parts,
                config=config,
            )
            return response.text or ""
        except errors.APIError as e:
            last_error = e
            if e.code not in RETRYABLE_CODES or attempt == MAX_RETRIES - 1:
                raise
            time.sleep(RETRY_BASE_DELAY_S * (2 ** attempt))

    raise last_error  # pragma: no cover — loop always returns or raises above


_JSON_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def extract_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    m = _JSON_FENCE.search(text)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last > first:
        candidate = text[first:last + 1]
        try:
            return json.loads(candidate)
        except Exception:
            pass
    return None


def analyze_product(
    mode: str,
    text: Optional[str] = None,
    url: Optional[str] = None,
    pdf_bytes: Optional[bytes] = None,
    image_bytes: Optional[bytes] = None,
    image_media_type: Optional[str] = None,
    clarifications: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    parts = build_user_content(
        mode=mode,
        text=text,
        url=url,
        pdf_bytes=pdf_bytes,
        image_bytes=image_bytes,
        image_media_type=image_media_type,
        clarifications=clarifications or [],
    )
    final_text = call_gemini(parts)
    parsed = extract_json(final_text)
    if parsed is None:
        return {
            "needs_clarification": False,
            "clarification_questions": [],
            "product": None,
            "classifications": [],
            "notes": [
                "No se pudo obtener una respuesta estructurada del modelo. "
                "Probá reformular la descripción o reintentar."
            ],
            "raw_text": (final_text or "")[:2000],
        }
    return parsed
