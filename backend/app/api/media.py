"""Endpoint pour servir les photos stockées (mode développement/LAN)."""
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.core.config import get_settings

router = APIRouter(prefix="/storage/photos", tags=["media"])
settings = get_settings()


@router.get("/{filename}")
async def get_photo(filename: str):
    # Sécurité : interdire les chemins relatifs
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")
    path = os.path.join(settings.STORAGE_PHOTOS, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Photo introuvable")
    return FileResponse(path)
