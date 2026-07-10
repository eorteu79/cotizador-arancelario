import json
import os
from typing import Optional, List

from dotenv import load_dotenv

# Load backend/.env (sibling of this app/ dir)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    CifInputs,
    Classification,
    ClarificationQuestion,
    ProductInfo,
    Rates,
)
from .claude_client import analyze_product
from .cost import compute_cost


app = FastAPI(title="Estimador de Costo de Importación a Argentina")

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


DISCLAIMER = (
    "Estimación orientativa basada en IA + búsqueda web. La clasificación NCM y las alícuotas "
    "deben verificarse con un despachante de aduana habilitado antes de operar."
)


def _build_response(parsed: dict, cif: Optional[CifInputs]) -> AnalyzeResponse:
    needs = bool(parsed.get("needs_clarification"))

    questions: List[ClarificationQuestion] = []
    if needs:
        for q in (parsed.get("clarification_questions") or []):
            try:
                questions.append(ClarificationQuestion(**q))
            except ValidationError:
                continue

    product: Optional[ProductInfo] = None
    if parsed.get("product"):
        try:
            product = ProductInfo(**parsed["product"])
        except ValidationError:
            product = None

    classifications: List[Classification] = []
    for c in (parsed.get("classifications") or []):
        try:
            rates_in = c.get("rates") or {}
            c_norm = {**c, "rates": Rates(**rates_in).model_dump()}
            classifications.append(Classification(**c_norm))
        except ValidationError:
            continue

    cost_breakdown = None
    if (not needs) and classifications and cif is not None:
        primary = classifications[0]
        cost_breakdown = compute_cost(cif, primary.rates)

    notes = list(parsed.get("notes") or [])
    if "raw_text" in parsed and parsed["raw_text"]:
        notes.append(
            "El modelo no devolvió JSON estructurado; se incluye su salida cruda en raw_text."
        )

    return AnalyzeResponse(
        needs_clarification=needs,
        clarification_questions=questions,
        product=product,
        classifications=classifications,
        cost_breakdown=cost_breakdown,
        notes=notes,
        disclaimer=DISCLAIMER,
    )


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "anthropic_key_configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
    }


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze_json(req: AnalyzeRequest):
    """Modes text y url (JSON body)."""
    if req.mode not in ("text", "url"):
        raise HTTPException(
            400,
            f"Modo '{req.mode}' requiere el endpoint /api/analyze/file (multipart).",
        )
    if req.mode == "text" and not (req.text and req.text.strip()):
        raise HTTPException(400, "Para modo 'text' debés enviar el campo 'text'.")
    if req.mode == "url" and not (req.url and req.url.strip()):
        raise HTTPException(400, "Para modo 'url' debés enviar el campo 'url'.")

    try:
        parsed = analyze_product(
            mode=req.mode,
            text=req.text,
            url=req.url,
            clarifications=[c.model_dump() for c in req.clarifications],
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error al consultar Claude: {e}")

    return _build_response(parsed, req.cif)


@app.post("/api/analyze/file", response_model=AnalyzeResponse)
async def analyze_file(
    mode: str = Form(...),
    file: UploadFile = File(...),
    cif_json: Optional[str] = Form(None),
    clarifications_json: Optional[str] = Form(None),
    text: Optional[str] = Form(None),
):
    """Modes pdf y image (multipart). cif_json y clarifications_json son strings JSON."""
    if mode not in ("pdf", "image"):
        raise HTTPException(400, f"Modo '{mode}' inválido para este endpoint (usá 'pdf' o 'image').")

    cif: Optional[CifInputs] = None
    if cif_json:
        try:
            cif = CifInputs(**json.loads(cif_json))
        except Exception as e:
            raise HTTPException(400, f"cif_json inválido: {e}")

    clarifications: List[dict] = []
    if clarifications_json:
        try:
            raw = json.loads(clarifications_json)
            for c in raw:
                if "id" in c and "answer" in c:
                    clarifications.append({"id": c["id"], "answer": c["answer"]})
        except Exception as e:
            raise HTTPException(400, f"clarifications_json inválido: {e}")

    data = await file.read()
    if not data:
        raise HTTPException(400, "El archivo está vacío.")
    # Reasonable size cap: 25 MB
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "El archivo excede 25 MB.")

    try:
        if mode == "pdf":
            parsed = analyze_product(
                mode="pdf",
                text=text,
                pdf_bytes=data,
                clarifications=clarifications,
            )
        else:
            media_type = (file.content_type or "").lower()
            if media_type not in ("image/jpeg", "image/png", "image/gif", "image/webp"):
                # Best-effort fallback by extension
                fname = (file.filename or "").lower()
                if fname.endswith(".png"):
                    media_type = "image/png"
                elif fname.endswith(".webp"):
                    media_type = "image/webp"
                elif fname.endswith(".gif"):
                    media_type = "image/gif"
                else:
                    media_type = "image/jpeg"
            parsed = analyze_product(
                mode="image",
                text=text,
                image_bytes=data,
                image_media_type=media_type,
                clarifications=clarifications,
            )
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        raise HTTPException(500, f"Error al consultar Claude: {e}")

    return _build_response(parsed, cif)
