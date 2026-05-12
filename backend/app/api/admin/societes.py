from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.deps import require_admin
from app.models.models import Societe, Utilisateur
from app.schemas.societe import SocieteCreate, SocieteUpdate, SocieteOut

router = APIRouter(prefix="/admin/societes", tags=["admin"])


@router.get("", response_model=list[SocieteOut])
async def list_societes(
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    result = await db.execute(select(Societe).order_by(Societe.nom))
    return result.scalars().all()


@router.post("", response_model=SocieteOut, status_code=status.HTTP_201_CREATED)
async def create_societe(
    payload: SocieteCreate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    societe = Societe(**payload.model_dump())
    db.add(societe)
    await db.flush()
    return societe


@router.patch("/{societe_id}", response_model=SocieteOut)
async def update_societe(
    societe_id: int,
    payload: SocieteUpdate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    result = await db.execute(select(Societe).where(Societe.id == societe_id))
    societe = result.scalar_one_or_none()
    if not societe:
        raise HTTPException(status_code=404, detail="Société introuvable")
    for field, val in payload.model_dump(exclude_none=True).items():
        setattr(societe, field, val)
    return societe


@router.delete("/{societe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_societe(
    societe_id: int,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    result = await db.execute(select(Societe).where(Societe.id == societe_id))
    societe = result.scalar_one_or_none()
    if not societe:
        raise HTTPException(status_code=404, detail="Société introuvable")
    await db.delete(societe)
