from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Any

from app.core.database import get_db
from app.api.deps import require_admin
from app.models.models import Utilisateur, Parametre
from app.schemas.parametre import ParametreOut, ParametreUpdate

router = APIRouter(prefix="/admin/parametres", tags=["admin"])

# Clés de configuration reconnues
KNOWN_KEYS = [
    "smtp_host", "smtp_port", "smtp_user", "smtp_password",
    "smtp_use_tls", "mail_achats",
    "ftp_host", "ftp_port", "ftp_user", "ftp_password",
    "ftp_use_sftp", "ftp_path_receptions", "ftp_path_codes_barres",
]


@router.get("", response_model=list[ParametreOut])
async def get_parametres(
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    result = await db.execute(select(Parametre).order_by(Parametre.cle))
    params = result.scalars().all()
    # Masquer les mots de passe dans la réponse
    out = []
    for p in params:
        val = "***" if "password" in p.cle else p.valeur
        out.append(ParametreOut(cle=p.cle, valeur=val))
    return out


@router.patch("/{cle}", response_model=ParametreOut)
async def update_parametre(
    cle: str,
    payload: ParametreUpdate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    result = await db.execute(select(Parametre).where(Parametre.cle == cle))
    param = result.scalar_one_or_none()
    if param:
        param.valeur = payload.valeur
    else:
        param = Parametre(cle=cle, valeur=payload.valeur)
        db.add(param)
    await db.flush()
    return ParametreOut(cle=param.cle, valeur=param.valeur)
