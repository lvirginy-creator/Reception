from pydantic import BaseModel, EmailStr


class MagasinBase(BaseModel):
    nom: str
    code: str
    societe_id: int
    mail_destinataire: str | None = None
    actif: bool = True


class MagasinCreate(MagasinBase):
    pass


class MagasinUpdate(BaseModel):
    nom: str | None = None
    code: str | None = None
    mail_destinataire: str | None = None
    actif: bool | None = None


class MagasinOut(MagasinBase):
    id: int
    societe_nom: str | None = None

    model_config = {"from_attributes": True}
