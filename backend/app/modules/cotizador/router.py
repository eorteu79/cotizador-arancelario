import json
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from ...core.auth import get_current_user
from .aranceles_db import VIGENCIA_BASE, lookup_ncm
from .cost import compute_cost
from .gemini_client import analyze_product
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    CifInputs,
    Classification,
    ClarificationQuestion,
    ProductInfo,
    Rates,
    RateSource,
)

router = APIRouter(dependencies=[Depends(get_current_user)])


DISCLAIMER = (
    "Estimación orientativa basada en IA + búsqueda web. La clasificación NCM y las alícuotas "
    "deben verificarse con un despachante de aduana habilitado antes de operar."
)


def _apply_base_rates(classification: Classification) -> Classification:
    """Cross-reference the NCM Gemini suggested against the tariff base (fase 3b: 10.242 posiciones).

    Gemini keeps suggesting the position, description, alternatives and requirements.
    If the NCM is found in the base, tasa estadística, IVA and the reduced-IVA flag
    (which feeds the IVA adicional percepción) are always overridden with the official
    base values. DIE is overridden too, unless the base has it empty (~950 positions,
    e.g. live animals) — in that case Gemini's estimated DIE is kept but flagged
    "verificar" instead of "base_oficial", since the base itself has no data for it.
    `ganancias_pct` isn't in the base schema yet, so it always stays as Gemini's
    estimate. If the NCM isn't found at all, everything is left as Gemini's estimate,
    marked "estimado_ia" for the frontend to flag as "verificar".
    """
    entry = lookup_ncm(classification.ncm)
    if entry is None:
        return classification

    die_conocido = entry.die_aec is not None
    rates_update = {
        "tasa_estadistica_pct": entry.tasa_estadistica,
        "iva_pct": entry.iva,
        "iva_adicional_pct": 0.0 if entry.iva == 0 else (10.0 if entry.iva_reducido else 20.0),
    }
    if die_conocido:
        rates_update["derecho_importacion_pct"] = entry.die_aec
    rates = classification.rates.model_copy(update=rates_update)

    rates_source = RateSource(
        derecho_importacion="base_oficial" if die_conocido else "verificar",
        tasa_estadistica="base_oficial",
        iva="base_oficial",
        iva_adicional="base_oficial",
        ganancias="estimado_ia",
    )
    return classification.model_copy(
        update={
            "rates": rates,
            "rates_source": rates_source,
            "base_match": True,
            "nota_base": entry.nota,
        }
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
            classifications.append(_apply_base_rates(Classification(**c_norm)))
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
        vigencia_base=VIGENCIA_BASE,
    )


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_json(req: AnalyzeRequest):
    """Modes text y url (JSON body)."""
    if req.mode not in ("text", "url"):
        raise HTTPException(
            400,
            f"Modo '{req.mode}' requiere el endpoint /analyze/file (multipart).",
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
        raise HTTPException(500, f"Error al consultar Gemini: {e}")

    return _build_response(parsed, req.cif)


@router.post("/analyze/file", response_model=AnalyzeResponse)
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
        raise HTTPException(500, f"Error al consultar Gemini: {e}")

    return _build_response(parsed, cif)
