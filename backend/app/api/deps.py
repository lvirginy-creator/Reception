from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError

from app.core.database import get_db
from app.core.security import decode_token
from app.models.models import Utilisateur, RoleUtilisateur

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Utilisateur:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")

    result = await db.execute(select(Utilisateur).where(Utilisateur.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.actif:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable ou inactif")
    return user


def require_role(*roles: RoleUtilisateur):
    async def _check(user: Utilisateur = Depends(get_current_user)) -> Utilisateur:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès refusé")
        return user
    return _check


def require_admin():
    return require_role(RoleUtilisateur.admin)


def require_responsable_or_above():
    return require_role(RoleUtilisateur.responsable, RoleUtilisateur.admin, RoleUtilisateur.achats)


def require_magasin_access(magasin_id: int, user: Utilisateur) -> None:
    """Vérifie que l'utilisateur peut accéder à ce magasin (isolation multi-tenant)."""
    if user.role in (RoleUtilisateur.admin, RoleUtilisateur.achats):
        return
    if user.magasin_id != magasin_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès refusé à ce magasin")
