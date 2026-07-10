from pydantic import BaseModel, Field
from typing import Optional, List, Dict


class CifInputs(BaseModel):
    cif_value: float = Field(..., gt=0, description="Valor CIF en la moneda elegida")
    currency: str = Field("USD", description="Moneda del valor CIF: USD, EUR, ARS, etc.")
    importer_type: str = Field(
        "responsable_inscripto",
        description="responsable_inscripto | consumidor_final",
    )
    include_percepciones: bool = Field(
        True,
        description="Incluir percepciones (IVA adic, Ganancias, IIBB) en el desembolso total",
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
    iva_adicional_pct: float = Field(20.0, description="IVA adicional / percepción IVA")
    ganancias_pct: float = Field(6.0, description="Percepción Impuesto a las Ganancias")
    iibb_pct: float = Field(2.5, description="Percepción Ingresos Brutos (varía por provincia)")


class Classification(BaseModel):
    ncm: str = Field(..., description="Posición arancelaria NCM (ej. 8516.79.90)")
    description: str
    probability: str = Field(..., description="alta | media | baja")
    rationale: str
    rates: Rates
    requirements: List[str] = []


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
    landed_cost: float = Field(..., description="Costo landed estimado según el tipo de importador y la elección de percepciones")
    notas: List[str] = []


class AnalyzeResponse(BaseModel):
    needs_clarification: bool
    clarification_questions: List[ClarificationQuestion] = []
    product: Optional[ProductInfo] = None
    classifications: List[Classification] = []
    cost_breakdown: Optional[CostBreakdown] = None
    notes: List[str] = []
    disclaimer: str = ""
