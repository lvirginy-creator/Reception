from datetime import datetime
from pydantic import BaseModel
from app.models.models import StatutImport, TypeImport


class ImportLogOut(BaseModel):
    id: int
    type: TypeImport
    fichier_nom: str | None = None
    statut: StatutImport
    lignes_traitees: int
    lignes_erreur: int
    message_erreur: str | None = None
    started_at: datetime
    ended_at: datetime | None = None

    model_config = {"from_attributes": True}
