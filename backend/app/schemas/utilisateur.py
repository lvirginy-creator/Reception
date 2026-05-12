from pydantic import BaseModel, field_validator
from app.models.models import RoleUtilisateur
import re


class UtilisateurBase(BaseModel):
    nom: str
    prenom: str
    role: RoleUtilisateur
    magasin_id: int | None = None
    actif: bool = True


class UtilisateurCreate(UtilisateurBase):
    pin: str | None = None
    password: str | None = None

    @field_validator("pin")
    @classmethod
    def pin_format(cls, v: str | None) -> str | None:
        if v is not None and not re.match(r"^\d{4,6}$", v):
            raise ValueError("Le PIN doit comporter 4 à 6 chiffres")
        return v


class UtilisateurUpdate(BaseModel):
    nom: str | None = None
    prenom: str | None = None
    magasin_id: int | None = None
    actif: bool | None = None
    pin: str | None = None
    password: str | None = None


class UtilisateurOut(UtilisateurBase):
    id: int
    magasin_nom: str | None = None

    model_config = {"from_attributes": True}
