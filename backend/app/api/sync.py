from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import Reception, LigneReception, Utilisateur, StatutReception, RoleUtilisateur
from app.schemas.sync import SyncPushPayload, SyncPullResponse
from app.schemas.reception import ReceptionDetail

router = APIRouter(prefix="/sync", tags=["sync"])


@router.get("/pull", response_model=SyncPullResponse)
async def sync_pull(
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    """Retourne toutes les réceptions actives du magasin pour stockage IndexedDB."""
    q = (
        select(Reception)
        .options(
            selectinload(Reception.lignes).selectinload(LigneReception.photos),
            selectinload(Reception.valide_par),
        )
        .where(Reception.statut.in_([StatutReception.en_cours, StatutReception.prete]))
    )
    if current_user.role in (RoleUtilisateur.magasinier, RoleUtilisateur.responsable):
        q = q.where(Reception.magasin_id == current_user.magasin_id)

    result = await db.execute(q)
    receptions = result.scalars().all()

    details = []
    for r in receptions:
        total = len(r.lignes)
        saisies = sum(1 for l in r.lignes if l.quantite_recue is not None)
        valide_par_nom = None
        if r.valide_par:
            valide_par_nom = f"{r.valide_par.prenom} {r.valide_par.nom}"
        details.append(ReceptionDetail(
            id=r.id, numero_en=r.numero_en, magasin_id=r.magasin_id,
            code_fournisseur=r.code_fournisseur, fournisseur_nom=r.fournisseur_nom,
            date_import=r.date_import, statut=r.statut, saisie_aveugle=r.saisie_aveugle,
            valide_le=r.valide_le, total_lignes=total, lignes_saisies=saisies,
            lignes=r.lignes, valide_par_nom=valide_par_nom,
        ))

    return SyncPullResponse(receptions=details)


@router.post("/push")
async def sync_push(
    payload: SyncPushPayload,
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    """Reçoit les saisies offline et les applique. La version tablette gagne (règle C5)."""
    results = []
    for update in payload.updates:
        try:
            result = await db.execute(
                select(Reception)
                .options(selectinload(Reception.lignes))
                .where(Reception.id == update.reception_id)
            )
            reception = result.scalar_one_or_none()
            if not reception:
                results.append({"reception_id": update.reception_id, "success": False, "message": "Introuvable"})
                continue

            if reception.statut not in (StatutReception.en_cours, StatutReception.prete):
                results.append({"reception_id": update.reception_id, "success": False, "message": "Non modifiable"})
                continue

            # Appliquer les mises à jour de lignes existantes
            ligne_map = {l.id: l for l in reception.lignes}
            for lu in update.lignes:
                ligne = ligne_map.get(lu.ligne_id)
                if not ligne:
                    continue
                if lu.quantite_recue is not None:
                    ligne.quantite_recue = lu.quantite_recue
                if lu.commentaire is not None:
                    ligne.commentaire = lu.commentaire
                ligne.modifie_par_user_id = current_user.id
                ligne.modifie_le = datetime.now(timezone.utc)

            # Nouvelles lignes hors commande
            for nl in update.nouvelles_lignes:
                new_ligne = LigneReception(
                    reception_id=reception.id,
                    ajout_hors_commande=True,
                    modifie_par_user_id=current_user.id,
                    modifie_le=datetime.now(timezone.utc),
                    **nl.model_dump(),
                )
                db.add(new_ligne)

            # Terminer si demandé
            if update.terminer:
                await db.flush()
                await db.refresh(reception, ["lignes"])
                non_saisies = [l for l in reception.lignes if l.quantite_recue is None]
                if not non_saisies:
                    reception.statut = StatutReception.prete

            results.append({"reception_id": update.reception_id, "success": True})
        except Exception as e:
            results.append({"reception_id": update.reception_id, "success": False, "message": str(e)})

    return {"results": results}
