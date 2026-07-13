from pydantic import BaseModel, Field
from typing import Optional, List, Dict


class CifInputs(BaseModel):
    cif_value: float = Field(..., gt=0, description="Valor CIF en la moneda elegida")
    currency: str = Field("USD", description="Moneda del valor CIF: USD, EUR, ARS, etc.")
    destino: str = Field(
        "bien_cambio",
        description=(
            "Destino de la mercadería según RG 2937 (AFIP): bien_cambio (mercadería para "
            "comercializar) | bien_uso (consumo propio, vida útil >= 2 años). Determina si "
            "corresponden las percepciones de IVA adicional y Ganancias."
        ),
    )
    iibb_pct: float = Field(
        2.5,
        ge=0,
        description=(
            "Percepción de Ingresos Brutos, configurable por el usuario: varía según la "
            "provincia/jurisdicción del importador y no depende de la posición arancelaria."
        ),
    )


class ClarificationAnswer(BaseModel):
    id: str
    answer: str


class AnalyzeRequest(BaseModel):
    mode: str = Field(..., description="text | url | pdf | image")
    text: Optional[str] = None
    url: Optional[str] = None
    clarifications: List[ClarificationAnswer] = []
    cif: Optional[CifInputs] = None


class ClarificationQuestion(BaseModel):
    id: str
    question: str
    why: str


class Rates(BaseModel):
    derecho_importacion_pct: float = Field(0.0, description="Derecho de Importación (AEC Mercosur)")
    tasa_estadistica_pct: float = Field(3.0, description="Tasa de Estadística sobre CIF")
    iva_pct: float = Field(21.0, description="IVA general 21% (10.5% reducido para ciertos productos)")
    iva_adicional_pct: float = Field(
        20.0,
        description=(
            "Percepción IVA adicional (RG 2937): 20% general, 10% si el bien tiene IVA "
            "reducido. Solo corresponde si el destino declarado es bien de cambio."
        ),
    )
    ganancias_pct: float = Field(
        6.0,
        description=(
            "Percepción Impuesto a las Ganancias (RG 2937). Solo corresponde si el destino "
            "declarado es bien de cambio."
        ),
    )


class RateSource(BaseModel):
    """Per-field origin of each rate: 'base_oficial' (official DB), 'estimado_ia' (Gemini,
    NCM not found in the base) or 'verificar' (NCM found in the base but this specific
    field — currently only die_aec for ~950 positions — has no data there)."""

    derecho_importacion: str = "estimado_ia"
    tasa_estadistica: str = "estimado_ia"
    iva: str = "estimado_ia"
    iva_adicional: str = "estimado_ia"
    ganancias: str = "estimado_ia"


class Classification(BaseModel):
    ncm: str = Field(..., description="Posición arancelaria NCM (ej. 8516.79.90)")
    description: str
    probability: str = Field(..., description="alta | media | baja")
    rationale: str
    rates: Rates
    requirements: List[str] = []
    rates_source: RateSource = Field(default_factory=RateSource)
    base_match: bool = Field(
        False, description="True si el NCM se encontró en la base de aranceles."
    )
    nota_base: Optional[str] = Field(
        None, description="Observación de la base oficial para este NCM, si existe."
    )


class ProductInfo(BaseModel):
    identified_name: str
    summary: str
    key_attributes: Dict[str, str] = {}
    confidence: str = Field(..., description="alta | media | baja")


class CostBreakdown(BaseModel):
    cif_value: float
    currency: str
    derecho_importacion: float
    tasa_estadistica: float
    base_iva: float
    iva: float
    iva_adicional: float
    ganancias: float
    iibb: float
    # Totales según interpretación
    costo_mercaderia: float = Field(..., description="CIF + DI + Tasa Estadística (impuestos no recuperables)")
    desembolso_aduana_sin_percepciones: float = Field(..., description="CIF + DI + TE + IVA")
    desembolso_aduana_total: float = Field(..., description="CIF + DI + TE + IVA + todas las percepciones")
    landed_cost: float = Field(..., description="Costo landed estimado: CIF + DI + Tasa + IVA + percepciones que correspondan según el destino")
    notas: List[str] = []


class AnalyzeResponse(BaseModel):
    needs_clarification: bool
    clarification_questions: List[ClarificationQuestion] = []
    product: Optional[ProductInfo] = None
    classifications: List[Classification] = []
    cost_breakdown: Optional[CostBreakdown] = None
    notes: List[str] = []
    disclaimer: str = ""
    vigencia_base: str = ""
    cotizacion_id: Optional[str] = Field(
        None, description="Id de la fila en public.cotizaciones si el guardado del historial tuvo éxito."
    )
    cotizacion_created_at: Optional[str] = Field(
        None, description="created_at de esa fila. Ausente junto con cotizacion_id si el guardado falló."
    )


class EntradaOriginal(BaseModel):
    """Input original de una cotización guardada en modo texto o url — permite que
    "Retomar" en el historial sea exacto en vez de best-effort. No se guarda para
    pdf/image."""

    modo: str = Field(..., description="text | url")
    valor: str = Field(..., description="El texto escrito o la URL analizada")
    cif: float
    moneda: str
    destino: str


class HistorialItem(BaseModel):
    id: str
    created_at: str
    producto: str
    ncm: Optional[str] = None
    fuente: str
    entrada: Optional[EntradaOriginal] = None


class HistorialListResponse(BaseModel):
    items: List[HistorialItem]
    limit: int
    offset: int


class HistorialResultado(AnalyzeResponse):
    """El AnalyzeResponse tal como se guardó, más la entrada original (si la hay).
    Solo se usa para el jsonb de historial — el AnalyzeResponse que devuelve
    /analyze en vivo no incluye este campo."""

    entrada: Optional[EntradaOriginal] = None


class HistorialDetail(BaseModel):
    id: str
    created_at: str
    producto: str
    ncm: Optional[str] = None
    fuente: str
    resultado: HistorialResultado
