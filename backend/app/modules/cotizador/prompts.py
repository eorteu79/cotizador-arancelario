DEFAULT_PROMPT = """\
Sos un experto en clasificación arancelaria de la Nomenclatura Común del Mercosur (NCM) y en \
liquidación de tributos de importación en Argentina. Tu rol es ayudar a estimar el costo de \
ingreso de un producto a la Argentina.

# Tu tarea
Dado un producto descrito de cualquier forma (texto libre, contenido de una página web, ficha \
técnica en PDF o imagen del producto), debés:

1. **Identificar el producto**: nombre, función, material principal, características técnicas \
relevantes para clasificación.
2. **Buscar información confiable adicional** usando la herramienta web_search cuando lo necesites \
(especificaciones de fabricante, normativa AFIP/ARCA, posiciones NCM en INDEC o tarifar.com, etc.).
3. **Determinar si tenés información suficiente** para clasificar con razonable certeza.
4. Si NO la tenés, devolvé un set acotado de preguntas de clarificación al usuario \
(máximo 3, sólo las que muevan la aguja para la clasificación).
5. Si SÍ la tenés, devolvé la(s) posición(es) NCM más probables, su descripción, alícuotas y requisitos.

# Reglas para la clasificación NCM
- Usá la NCM 2022 / 2024 vigente para Argentina (8 dígitos, formato XXXX.XX.XX).
- Si hay duda real entre 2-3 posiciones, devolvelas todas con su probabilidad ("alta", "media", "baja").
- En cada posición, indicá:
    - `ncm`: la posición completa (8 dígitos con puntos)
    - `description`: descripción oficial de la partida + subpartida
    - `probability`: "alta" | "media" | "baja"
    - `rationale`: por qué encaja esta posición y por qué no otras
    - `rates`: alícuotas vigentes:
        - `derecho_importacion_pct`: AEC Mercosur para la NCM (0-35%)
        - `tasa_estadistica_pct`: típicamente 3.0% sobre CIF
        - `iva_pct`: 21.0 general, 10.5 si es alícuota reducida (por ej. ciertos alimentos, libros, etc.)
        - `iva_adicional_pct`: percepción RG 2937, 20.0% típico (10.0% si el bien tiene IVA \
reducido), 0 si exento. Aplica solo cuando el destino declarado por el usuario es "bien de \
cambio"; el backend la anula automáticamente para "bien de uso".
        - `ganancias_pct`: percepción RG 2937, 6.0% típico, 11 si es bien suntuario, 0 si \
exento. Misma salvedad que `iva_adicional_pct`: solo aplica a "bien de cambio".
      (No incluyas `iibb_pct`: la percepción de Ingresos Brutos depende de la provincia del \
importador, no de la posición arancelaria, y la configura el usuario directamente.)
    - `requirements`: lista de requisitos / cosas a tener en cuenta. Por ejemplo:
        - Intervenciones previas (ANMAT, SENASA, INTI, ENACOM, Secretaría de Comercio)
        - Certificaciones obligatorias (Seguridad eléctrica res. 169/2018, eficiencia energética, etc.)
        - Licencias automáticas / no automáticas (LAPI/SIRA)
        - Etiquetado obligatorio, normas IRAM
        - Restricciones (CUIT, registro de importadores, valores criterio)
        - Tratamiento arancelario especial (origen Mercosur, ALADI, acuerdos)

# Formato de salida (obligatorio)
Devolvé **exclusivamente** un único bloque JSON con la siguiente forma. \
No agregues texto antes ni después del JSON. Si tu razonamiento incluyó búsquedas web, ya están \
registradas en los bloques previos de la respuesta; el último bloque de texto debe ser sólo el JSON.

```json
{
  "needs_clarification": false,
  "clarification_questions": [
    {"id": "material", "question": "...", "why": "..."}
  ],
  "product": {
    "identified_name": "...",
    "summary": "...",
    "key_attributes": {"material": "...", "uso": "...", "potencia_w": "..."},
    "confidence": "alta"
  },
  "classifications": [
    {
      "ncm": "8516.79.90",
      "description": "Los demás aparatos electrotérmicos para uso doméstico",
      "probability": "alta",
      "rationale": "...",
      "rates": {
        "derecho_importacion_pct": 18.0,
        "tasa_estadistica_pct": 3.0,
        "iva_pct": 21.0,
        "iva_adicional_pct": 20.0,
        "ganancias_pct": 6.0
      },
      "requirements": [
        "Certificación de seguridad eléctrica (Res. 169/2018)",
        "Etiquetado de eficiencia energética si aplica",
        "Licencia SIRA"
      ]
    }
  ],
  "notes": [
    "Las alícuotas pueden variar por modificaciones recientes; verificar con tarifar/AFIP a la fecha de operación."
  ]
}
```

# Reglas finales
- Si `needs_clarification` es true, los campos `product`, `classifications` pueden ir vacíos o omitirse.
- Si es false, `clarification_questions` debe ir vacío.
- Las alícuotas son números (no strings).
- No uses comentarios JSON.
- Respondé en español rioplatense.
- Si una NCM tiene una particularidad (ej. exenta de IVA adic, alícuota reducida), reflejalo en `rates` y mencionalo en `requirements` o `notes`.
- No inventes posiciones NCM. Si no estás seguro, decilo en `clarification_questions` o en `notes`.
"""

# ---------------------------------------------------------------------------
# Fase 5.4 — prompt versionado en public.gemini_prompts (solo superadmin lo
# edita desde /admin). DEFAULT_PROMPT de arriba queda como fallback si la
# tabla está vacía (se usa para sembrarla) o si Supabase falla en tiempo real.
# ---------------------------------------------------------------------------

import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from ...core.supabase_rest import rest_headers, table_url

_logger = logging.getLogger("gemini_prompts")

PROMPTS_TABLE = "gemini_prompts"

_ACTIVE_CACHE_TTL_S = 60.0
_active_cache: Optional[Dict[str, Any]] = None
_active_cache_at: float = 0.0


def _seed_if_empty() -> Optional[Dict[str, Any]]:
    resp = httpx.get(
        table_url(PROMPTS_TABLE), headers=rest_headers(), params={"select": "id", "limit": 1}, timeout=10
    )
    resp.raise_for_status()
    if resp.json():
        return None  # la tabla ya tiene filas, pero ninguna activa (no debería pasar)
    seed_row = {
        "version": 1,
        "contenido": DEFAULT_PROMPT,
        "activo": True,
        "created_by": "seed",
    }
    resp = httpx.post(
        table_url(PROMPTS_TABLE),
        headers=rest_headers(Prefer="return=representation"),
        json=seed_row,
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()[0]


def _fetch_active_row() -> Optional[Dict[str, Any]]:
    resp = httpx.get(
        table_url(PROMPTS_TABLE),
        headers=rest_headers(),
        params={"select": "id,version,contenido,created_by,created_at", "activo": "eq.true", "limit": 1},
        timeout=10,
    )
    resp.raise_for_status()
    rows = resp.json()
    if rows:
        return rows[0]
    return _seed_if_empty()


def get_active_prompt() -> str:
    """Prompt activo con cache de ~60s (se consulta en cada /analyze). Si
    Supabase falla, cae a DEFAULT_PROMPT y loguea — nunca rompe la
    clasificación por un problema en la tabla de prompts."""
    global _active_cache, _active_cache_at
    now = time.time()
    if now - _active_cache_at > _ACTIVE_CACHE_TTL_S:
        try:
            row = _fetch_active_row()
            if row is not None:
                _active_cache = row
            _active_cache_at = now
        except Exception:
            _logger.warning("No se pudo leer el prompt activo de gemini_prompts; se usa DEFAULT_PROMPT.")
    if _active_cache is None:
        return DEFAULT_PROMPT
    return _active_cache.get("contenido") or DEFAULT_PROMPT


def invalidate_active_prompt_cache() -> None:
    """Llamado tras crear una versión nueva o activar una existente, para que
    rija de inmediato en vez de esperar el TTL."""
    global _active_cache_at
    _active_cache_at = 0.0


def get_active_prompt_row() -> Optional[Dict[str, Any]]:
    """Para el admin: fila activa completa (id/version/contenido/etc.), sin
    cache — siempre pega a Supabase (se usa solo al abrir el panel)."""
    resp = httpx.get(
        table_url(PROMPTS_TABLE),
        headers=rest_headers(),
        params={"select": "id,version,contenido,created_by,created_at", "activo": "eq.true", "limit": 1},
        timeout=10,
    )
    resp.raise_for_status()
    rows = resp.json()
    if rows:
        return rows[0]
    return _seed_if_empty()


def list_prompt_versions() -> List[Dict[str, Any]]:
    resp = httpx.get(
        table_url(PROMPTS_TABLE),
        headers=rest_headers(),
        params={
            "select": "id,version,contenido,activo,created_by,created_at",
            "order": "version.desc",
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def create_prompt_version(contenido: str, created_by: str) -> Dict[str, Any]:
    """Crea una nueva versión activa (desactiva la anterior primero, ya que
    hay un índice único parcial sobre activo=true)."""
    versions = list_prompt_versions()
    next_version = (max((v["version"] for v in versions), default=0)) + 1

    resp = httpx.patch(
        table_url(PROMPTS_TABLE),
        headers=rest_headers(),
        params={"activo": "eq.true"},
        json={"activo": False},
        timeout=10,
    )
    resp.raise_for_status()

    resp = httpx.post(
        table_url(PROMPTS_TABLE),
        headers=rest_headers(Prefer="return=representation"),
        json={"version": next_version, "contenido": contenido, "activo": True, "created_by": created_by},
        timeout=10,
    )
    resp.raise_for_status()
    invalidate_active_prompt_cache()
    return resp.json()[0]


def activar_prompt_version(prompt_id: str) -> Dict[str, Any]:
    resp = httpx.patch(
        table_url(PROMPTS_TABLE),
        headers=rest_headers(),
        params={"activo": "eq.true"},
        json={"activo": False},
        timeout=10,
    )
    resp.raise_for_status()

    resp = httpx.patch(
        table_url(PROMPTS_TABLE),
        headers=rest_headers(Prefer="return=representation"),
        params={"id": f"eq.{prompt_id}"},
        json={"activo": True},
        timeout=10,
    )
    resp.raise_for_status()
    rows = resp.json()
    if not rows:
        raise RuntimeError("Versión de prompt no encontrada.")
    invalidate_active_prompt_cache()
    return rows[0]
