import json
import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import ValidationError

from ...core.auth import get_current_user
from .aranceles_db import VIGENCIA_BASE, lookup_ncm
from .cost import compute_cost
from .gemini_client import analyze_product
from .historial import guardar_cotizacion, listar_cotizaciones, obtener_cotizacion
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    CifInputs,
    Classification,
    ClarificationQuestion,
    EntradaOriginal,
    HistorialDetail,
    HistorialItem,
    HistorialListResponse,
    ProductInfo,
    Rates,
    RateSource,
)

router = APIRouter(dependencies=[Depends(get_current_user)])

logger = logging.getLogger(__name__)

# Un único campo (derecho_importacion) alcanza para derivar el badge de origen de
# toda la cotización: es el único que _apply_base_rates puede marcar "verificar"
# (sin dato en la base para esa posición); los demás son siempre base_oficial o
# estimado_ia junto con él.
FUENTE_BY_RATE_SOURCE = {
    "base_oficial": "base",
    "verificar": "sin_dato",
    "estimado_ia": "estimado",
}


def _guardar_historial(
    user: dict,
    resp: AnalyzeResponse,
    fallback_producto: str,
    entrada: Optional[EntradaOriginal] = None,
) -> None:
    """Guarda la cotización final en el historial y completa resp.cotizacion_id /
    resp.cotizacion_created_at con la fila insertada, para que el frontend pueda
    nombrar el archivo exportado por id sin pegarle de nuevo al historial. No debe
    romper la respuesta al usuario si falla (Supabase caído, RLS mal configurado,
    etc.) — en ese caso resp queda sin id y el frontend cae a un nombre de archivo
    por timestamp (ver export/filename.ts).

    `entrada` (solo para modos text/url) va embebida en el jsonb `resultado`,
    no en una columna nueva, para que "Retomar" pueda reconstruir la consulta
    original exacta en vez de un best-effort."""
    if resp.needs_clarification or not resp.classifications:
        return
    user_id = user.get("sub")
    if not user_id:
        return
    primary = resp.classifications[0]
    producto = (resp.product.identified_name if resp.product else None) or fallback_producto
    try:
        row = guardar_cotizacion(
            user_id=user_id,
            producto=producto,
            ncm=primary.ncm,
            fuente=FUENTE_BY_RATE_SOURCE.get(primary.rates_source.derecho_importacion, "estimado"),
            resultado={
                **resp.model_dump(),
                "entrada": entrada.model_dump() if entrada else None,
            },
        )
        resp.cotizacion_id = row.get("id")
        resp.cotizacion_created_at = row.get("created_at")
    except Exception:
        logger.exception("No se pudo guardar la cotización en el historial.")


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
def analyze_json(req: AnalyzeRequest, user: dict = Depends(get_current_user)):
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

    resp = _build_response(parsed, req.cif)
    entrada = None
    if req.cif is not None:
        entrada = EntradaOriginal(
            modo=req.mode,
            valor=(req.text if req.mode == "text" else req.url) or "",
            cif=req.cif.cif_value,
            moneda=req.cif.currency,
            destino=req.cif.destino,
        )
    _guardar_historial(
        user, resp, fallback_producto=(req.text or req.url or "Consulta"), entrada=entrada
    )
    return resp


@router.post("/analyze/file", response_model=AnalyzeResponse)
async def analyze_file(
    mode: str = Form(...),
    file: UploadFile = File(...),
    cif_json: Optional[str] = Form(None),
    clarifications_json: Optional[str] = Form(None),
    text: Optional[str] = Form(None),
    user: dict = Depends(get_current_user),
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

    resp = _build_response(parsed, cif)
    _guardar_historial(user, resp, fallback_producto=(text or f"Archivo: {file.filename}"))
    return resp


@router.get("/historial", response_model=HistorialListResponse)
def historial_list(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(401, "Token sin 'sub'.")
    try:
        rows = listar_cotizaciones(user_id=user_id, limit=limit, offset=offset)
    except Exception as e:
        raise HTTPException(502, f"No se pudo leer el historial: {e}")
    return HistorialListResponse(
        items=[HistorialItem(**r) for r in rows], limit=limit, offset=offset
    )


@router.get("/historial/{cotizacion_id}", response_model=HistorialDetail)
def historial_detail(cotizacion_id: str, user: dict = Depends(get_current_user)):
    try:
        UUID(cotizacion_id)
    except ValueError:
        raise HTTPException(404, "Cotización no encontrada.")

    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(401, "Token sin 'sub'.")
    try:
        row = obtener_cotizacion(user_id=user_id, cotizacion_id=cotizacion_id)
    except Exception as e:
        raise HTTPException(502, f"No se pudo leer la cotización: {e}")
    if row is None:
        raise HTTPException(404, "Cotización no encontrada.")
    return HistorialDetail(**row)
