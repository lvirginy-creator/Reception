from pydantic import BaseModel
from .reception import LigneUpdate, LigneCreate, ReceptionDetail


class OfflineLigneUpdate(BaseModel):
    ligne_id: int
    quantite_recue: int | None = None
    commentaire: str | None = None


class OfflineReceptionUpdate(BaseModel):
    reception_id: int
    lignes: list[OfflineLigneUpdate] = []
    nouvelles_lignes: list[LigneCreate] = []
    terminer: bool = False


class SyncPushPayload(BaseModel):
    updates: list[OfflineReceptionUpdate]


class SyncPushResult(BaseModel):
    reception_id: int
    success: bool
    message: str | None = None


class SyncPullResponse(BaseModel):
    receptions: list[ReceptionDetail]
