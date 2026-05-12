from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import require_admin
from app.models.models import Magasin, Societe, Utilisateur
from app.schemas.magasin import MagasinCreate, MagasinUpdate, MagasinOut

router = APIRouter(prefix="/admin/magasins", tags=["admin"])


def _to_out(m: Magasin) -> MagasinOut:
    return MagasinOut(
        id=m.id,
        nom=m.nom,
        code=m.code,
        societe_id=m.societe_id,
        mail_destinataire=m.mail_destinataire,
        actif=m.actif,
        societe_nom=m.societe.nom if m.societe else None,
    )


@router.get("", response_model=list[MagasinOut])
async def list_magasins(
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    result = await db.execute(
        select(Magasin).options(selectinload(Magasin.societe)).order_by(Magasin.nom)
    )
    return [_to_out(m) for m in result.scalars().all()]


@router.post("", response_model=MagasinOut, status_code=status.HTTP_201_CREATED)
async def create_magasin(
    payload: MagasinCreate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    r = await db.execute(select(Societe).where(Societe.id == payload.societe_id))
    if not r.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Société introuvable")
    magasin = Magasin(**payload.model_dump())
    db.add(magasin)
    await db.flush()
    await db.refresh(magasin, ["societe"])
    return _to_out(magasin)


@router.patch("/{magasin_id}", response_model=MagasinOut)
async def update_magasin(
    magasin_id: int,
    payload: MagasinUpdate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    result = await db.execute(
        select(Magasin).options(selectinload(Magasin.societe)).where(Magasin.id == magasin_id)
    )
    magasin = result.scalar_one_or_none()
    if not magasin:
        raise HTTPException(status_code=404, detail="Magasin introuvable")
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(magasin, field, val)
    return _to_out(magasin)


@router.delete("/{magasin_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_magasin(
    magasin_id: int,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    result = await db.execute(select(Magasin).where(Magasin.id == magasin_id))
    magasin = result.scalar_one_or_none()
    if not magasin:
        raise HTTPException(status_code=404, detail="Magasin introuvable")
    await db.delete(magasin)
