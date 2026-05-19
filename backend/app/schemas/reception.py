from datetime import datetime
from pydantic import BaseModel
from app.models.models import StatutReception


class PhotoOut(BaseModel):
    id: int
    chemin_fichier: str
    commentaire: str | None = None
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class LigneReceptionOut(BaseModel):
    id: int
    reception_id: int
    article_id: int | None = None
    reference_interne: str
    reference_fournisseur: str | None = None
    designation: str
    quantite_attendue: int | None = None
    quantite_recue: int | None = None
    ajout_hors_commande: bool
    commentaire: str | None = None
    modifie_le: datetime | None = None
    photos: list[PhotoOut] = []

    model_config = {"from_attributes": True}


class LigneUpdate(BaseModel):
    quantite_recue: int | None = None
    commentaire: str | None = None


class LigneCreate(BaseModel):
    reference_interne: str
    reference_fournisseur: str | None = None
    designation: str
    article_id: int | None = None
    quantite_recue: int | None = None
    commentaire: str | None = None


class ReceptionOut(BaseModel):
    id: int
    numero_en: str
    magasin_id: int
    code_fournisseur: str
    fournisseur_nom: str
    num_facture_fournisseur: str | None = None
    date_import: datetime
    statut: StatutReception
    saisie_aveugle: bool
    valide_le: datetime | None = None
    total_lignes: int = 0
    lignes_saisies: int = 0

    model_config = {"from_attributes": True}


class ReceptionDetail(ReceptionOut):
    lignes: list[LigneReceptionOut] = []
    valide_par_nom: str | None = None


class SaisieAveugletoggle(BaseModel):
    actif: bool
