from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import require_admin
from app.core.security import hash_pin, hash_password
from app.models.models import Utilisateur, Magasin, RoleUtilisateur
from app.schemas.utilisateur import UtilisateurCreate, UtilisateurUpdate, UtilisateurOut

router = APIRouter(prefix="/admin/utilisateurs", tags=["admin"])


def _to_out(u: Utilisateur) -> UtilisateurOut:
    return UtilisateurOut(
        id=u.id,
        nom=u.nom,
        prenom=u.prenom,
        role=u.role,
        magasin_id=u.magasin_id,
        actif=u.actif,
        magasin_nom=u.magasin.nom if u.magasin else None,
    )


@router.get("", response_model=list[UtilisateurOut])
async def list_utilisateurs(
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    result = await db.execute(
        select(Utilisateur).options(selectinload(Utilisateur.magasin)).order_by(Utilisateur.nom)
    )
    return [_to_out(u) for u in result.scalars().all()]


@router.post("", response_model=UtilisateurOut, status_code=status.HTTP_201_CREATED)
async def create_utilisateur(
    payload: UtilisateurCreate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    # Validation : admin doit avoir un password, les autres un PIN
    if payload.role == RoleUtilisateur.admin:
        if not payload.password:
            raise HTTPException(status_code=400, detail="Un mot de passe est requis pour l'admin")
    else:
        if not payload.pin:
            raise HTTPException(status_code=400, detail="Un PIN est requis")
        if not payload.magasin_id and payload.role in (RoleUtilisateur.magasinier, RoleUtilisateur.responsable):
            raise HTTPException(status_code=400, detail="Un magasin est requis pour ce rôle")

    data = payload.model_dump(exclude={"pin", "password"})
    user = Utilisateur(**data)

    if payload.pin:
        user.pin_hash = hash_pin(payload.pin)
    if payload.password:
        user.password_hash = hash_password(payload.password)

    db.add(user)
    await db.flush()

    if user.magasin_id:
        await db.refresh(user, ["magasin"])

    return _to_out(user)


@router.patch("/{user_id}", response_model=UtilisateurOut)
async def update_utilisateur(
    user_id: int,
    payload: UtilisateurUpdate,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    result = await db.execute(
        select(Utilisateur).options(selectinload(Utilisateur.magasin)).where(Utilisateur.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    data = payload.model_dump(exclude_none=True, exclude={"pin", "password"})
    for field, val in data.items():
        setattr(user, field, val)

    if payload.pin:
        user.pin_hash = hash_pin(payload.pin)
    if payload.password:
        user.password_hash = hash_password(payload.password)

    return _to_out(user)


@router.post("/{user_id}/toggle-actif", response_model=UtilisateurOut)
async def toggle_actif(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current: Utilisateur = Depends(require_admin()),
):
    if user_id == current.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas désactiver votre propre compte")
    result = await db.execute(
        select(Utilisateur).options(selectinload(Utilisateur.magasin)).where(Utilisateur.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    user.actif = not user.actif
    return _to_out(user)


@router.post("/{user_id}/reset-pin", status_code=status.HTTP_204_NO_CONTENT)
async def reset_pin(
    user_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    pin = payload.get("pin", "")
    if not pin or len(pin) < 4 or not pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN invalide (4-6 chiffres requis)")
    result = await db.execute(select(Utilisateur).where(Utilisateur.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.role == RoleUtilisateur.admin:
        raise HTTPException(status_code=400, detail="Les admins utilisent un mot de passe, pas un PIN")
    user.pin_hash = hash_pin(pin)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_utilisateur(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current: Utilisateur = Depends(require_admin()),
):
    if user_id == current.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")
    result = await db.execute(select(Utilisateur).where(Utilisateur.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    await db.delete(user)
