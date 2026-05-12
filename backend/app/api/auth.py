from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import (
    verify_pin, verify_password, create_access_token, create_refresh_token,
    decode_token, is_locked_out, record_failed_attempt, clear_attempts,
)
from app.models.models import Utilisateur, Magasin, RoleUtilisateur
from app.schemas.auth import PinLoginRequest, AdminLoginRequest, TokenResponse, RefreshRequest
from jose import JWTError

router = APIRouter(prefix="/auth", tags=["auth"])


def _build_token_response(user: Utilisateur, magasin: Magasin | None) -> TokenResponse:
    extra = {"role": user.role.value, "magasin_id": user.magasin_id}
    access_token = create_access_token(user.id, extra=extra)
    refresh_token = create_refresh_token(user.id)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        role=user.role.value,
        nom=user.nom,
        prenom=user.prenom,
        magasin_id=user.magasin_id,
        magasin_nom=magasin.nom if magasin else None,
    )


@router.post("/pin", response_model=TokenResponse)
async def login_pin(payload: PinLoginRequest, db: AsyncSession = Depends(get_db)):
    # Résoudre le magasin
    result = await db.execute(select(Magasin).where(Magasin.code == payload.magasin_code, Magasin.actif == True))
    magasin = result.scalar_one_or_none()
    if not magasin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Magasin introuvable")

    # Trouver l'utilisateur avec un PIN dans ce magasin
    result = await db.execute(
        select(Utilisateur).where(
            Utilisateur.magasin_id == magasin.id,
            Utilisateur.actif == True,
            Utilisateur.pin_hash.isnot(None),
        )
    )
    users = result.scalars().all()

    matched_user: Utilisateur | None = None
    for u in users:
        if is_locked_out(u.id):
            continue
        if verify_pin(payload.pin, u.pin_hash):
            matched_user = u
            break

    if not matched_user:
        # Enregistrer l'échec pour tous les utilisateurs du magasin (on ne sait pas qui a essayé)
        for u in users:
            count = record_failed_attempt(u.id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="PIN incorrect ou compte verrouillé"
        )

    clear_attempts(matched_user.id)
    return _build_token_response(matched_user, magasin)


@router.post("/login", response_model=TokenResponse)
async def login_admin(payload: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Utilisateur).where(
            Utilisateur.nom == payload.username,
            Utilisateur.role == RoleUtilisateur.admin,
            Utilisateur.actif == True,
        )
    )
    user = result.scalar_one_or_none()
    if not user or not user.password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")
    if is_locked_out(user.id):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Compte temporairement verrouillé")
    if not verify_password(payload.password, user.password_hash):
        record_failed_attempt(user.id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")
    clear_attempts(user.id)
    return _build_token_response(user, None)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        data = decode_token(payload.refresh_token)
        if data.get("type") != "refresh":
            raise ValueError
        user_id = int(data["sub"])
    except (JWTError, ValueError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalide")

    result = await db.execute(select(Utilisateur).where(Utilisateur.id == user_id, Utilisateur.actif == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")

    magasin = None
    if user.magasin_id:
        r2 = await db.execute(select(Magasin).where(Magasin.id == user.magasin_id))
        magasin = r2.scalar_one_or_none()

    return _build_token_response(user, magasin)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout():
    # JWT stateless — le client supprime le token localement
    return
