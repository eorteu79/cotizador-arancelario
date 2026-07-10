import os
import json
import base64
import re
from typing import Optional, List, Dict, Any, Tuple

import httpx
from bs4 import BeautifulSoup
from anthropic import Anthropic

from .prompts import SYSTEM_PROMPT


_client: Optional[Anthropic] = None

MODEL = "claude-opus-4-7"
MAX_TOKENS = 16000
MAX_PAUSE_ITER = 5
URL_FETCH_MAX_CHARS = 30000
USER_AGENT = "Mozilla/5.0 (compatible; ImportCostBot/1.0; +https://localhost)"


def get_client() -> Anthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY no está configurada. Copiá backend/.env.example "
                "a backend/.env y poné tu API key de Anthropic."
            )
        _client = Anthropic(api_key=api_key)
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
) -> List[Dict[str, Any]]:
    content: List[Dict[str, Any]] = []
    intro = "Necesito clasificar este producto para importarlo a Argentina y estimar costos."

    if mode == "text":
        body = f"{intro}\n\nDescripción del producto:\n{text or ''}"
        content.append({"type": "text", "text": body})

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
                "Usá la herramienta web_search para obtener más información sobre el producto.)\n"
            )
        content.append({"type": "text", "text": body})

    elif mode == "pdf":
        content.append({
            "type": "text",
            "text": f"{intro}\n\nTe paso la ficha técnica del producto en PDF adjunto.",
        })
        if pdf_bytes:
            content.append({
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.standard_b64encode(pdf_bytes).decode("utf-8"),
                },
            })

    elif mode == "image":
        content.append({
            "type": "text",
            "text": (
                f"{intro}\n\nTe paso una foto del producto. Identificá qué es y qué "
                "características técnicas relevantes podés inferir; usá web_search si necesitás "
                "complementar la información."
            ),
        })
        if image_bytes:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image_media_type or "image/jpeg",
                    "data": base64.standard_b64encode(image_bytes).decode("utf-8"),
                },
            })

    else:
        content.append({"type": "text", "text": "(Modo de entrada no soportado)"})

    if clarifications:
        lines = ["\nRespuestas a preguntas anteriores de clarificación:"]
        for c in clarifications:
            cid = c.get("id", "")
            ans = c.get("answer", "")
            lines.append(f"- {cid}: {ans}")
        content.append({"type": "text", "text": "\n".join(lines)})

    return content


def call_claude(messages: List[Dict[str, Any]]) -> str:
    """Call Claude with web_search; handle pause_turn loops. Returns concatenated final text."""
    client = get_client()
    tools = [{"type": "web_search_20260209", "name": "web_search"}]

    current_messages = list(messages)
    response = None
    for _ in range(MAX_PAUSE_ITER):
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=current_messages,
        )
        if response.stop_reason != "pause_turn":
            break
        # Server-side tool loop hit limit; echo assistant turn back and resume
        current_messages = current_messages + [
            {"role": "assistant", "content": response.content}
        ]

    if response is None:
        return ""

    text_parts: List[str] = []
    for block in response.content:
        if getattr(block, "type", None) == "text":
            text_parts.append(block.text)
    return "\n".join(text_parts)


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
    user_content = build_user_content(
        mode=mode,
        text=text,
        url=url,
        pdf_bytes=pdf_bytes,
        image_bytes=image_bytes,
        image_media_type=image_media_type,
        clarifications=clarifications or [],
    )
    messages = [{"role": "user", "content": user_content}]
    final_text = call_claude(messages)
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
