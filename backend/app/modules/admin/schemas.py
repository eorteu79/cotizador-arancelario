from typing import List, Optional

from pydantic import BaseModel, Field


class OverrideIn(BaseModel):
    die_aec: Optional[float] = None
    tasa_estadistica: Optional[float] = None
    iva: Optional[float] = None
    iva_reducido: Optional[bool] = None
    nota: Optional[str] = None
    vigencia: Optional[str] = None


class OverrideOut(BaseModel):
    ncm: str
    die_aec: Optional[float] = None
    tasa_estadistica: Optional[float] = None
    iva: Optional[float] = None
    iva_reducido: Optional[bool] = None
    nota: Optional[str] = None
    vigencia: Optional[str] = None
    editado_por: Optional[str] = None
    updated_at: Optional[str] = None


class OverridesListResponse(BaseModel):
    items: List[OverrideOut]


class PromptVersion(BaseModel):
    id: str
    version: int
    contenido: str
    activo: bool
    created_by: Optional[str] = None
    created_at: str


class PromptActivo(BaseModel):
    id: str
    version: int
    contenido: str
    created_by: Optional[str] = None
    created_at: str


class PromptStateResponse(BaseModel):
    activo: PromptActivo
    versiones: List[PromptVersion]


class PromptCreateRequest(BaseModel):
    contenido: str = Field(..., min_length=1)


class UsuarioOut(BaseModel):
    id: str
    email: Optional[str] = None
    created_at: Optional[str] = None
    last_sign_in_at: Optional[str] = None
    role: Optional[str] = None


class UsuariosListResponse(BaseModel):
    items: List[UsuarioOut]
    page: int
    per_page: int


class AccesoIn(BaseModel):
    email: str
    permitido: bool = True
    nota: Optional[str] = None


class AccesoOut(BaseModel):
    email: str
    permitido: bool
    nota: Optional[str] = None
    creado_por: Optional[str] = None
    created_at: Optional[str] = None


class AccesoListResponse(BaseModel):
    items: List[AccesoOut]


class RoleIn(BaseModel):
    email: str
    role: str = Field(..., description="admin | superadmin")


class RoleOut(BaseModel):
    email: str
    role: str
    created_at: Optional[str] = None
