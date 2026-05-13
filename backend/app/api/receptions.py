import os
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.config import get_settings
from app.api.deps import get_current_user, require_magasin_access
from app.models.models import (
    Reception, LigneReception, PhotoLigne, Utilisateur,
    StatutReception, RoleUtilisateur,
)
from app.schemas.reception import (
    ReceptionOut, ReceptionDetail, LigneUpdate, LigneCreate,
    SaisieAveugletoggle,
)

router = APIRouter(prefix="/receptions", tags=["receptions"])
settings = get_settings()

PHOTO_MAX_BYTES = 5 * 1024 * 1024  # 5 Mo


def _count_stats(reception: Reception) -> tuple[int, int]:
    total = len(reception.lignes)
    saisies = sum(1 for l in reception.lignes if l.quantite_recue is not None)
    return total, saisies


def _to_out(r: Reception) -> ReceptionOut:
    total, saisies = _count_stats(r)
    return ReceptionOut(
        id=r.id, numero_en=r.numero_en, magasin_id=r.magasin_id,
        code_fournisseur=r.code_fournisseur, fournisseur_nom=r.fournisseur_nom,
        date_import=r.date_import, statut=r.statut, saisie_aveugle=r.saisie_aveugle,
        valide_le=r.valide_le, total_lignes=total, lignes_saisies=saisies,
    )


def _to_detail(r: Reception) -> ReceptionDetail:
    total, saisies = _count_stats(r)
    valide_par_nom = None
    if r.valide_par:
        valide_par_nom = f"{r.valide_par.prenom} {r.valide_par.nom}"
    return ReceptionDetail(
        id=r.id, numero_en=r.numero_en, magasin_id=r.magasin_id,
        code_fournisseur=r.code_fournisseur, fournisseur_nom=r.fournisseur_nom,
        date_import=r.date_import, statut=r.statut, saisie_aveugle=r.saisie_aveugle,
        valide_le=r.valide_le, total_lignes=total, lignes_saisies=saisies,
        lignes=r.lignes, valide_par_nom=valide_par_nom,
    )


def _assert_editable(reception: Reception):
    if reception.statut not in (StatutReception.en_cours, StatutReception.prete):
        raise HTTPException(status_code=400, detail="Cette réception n'est plus modifiable")


@router.get("", response_model=list[ReceptionOut])
async def list_receptions(
    statut: str | None = None,
    fournisseur: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    q = select(Reception).options(selectinload(Reception.lignes))

    if current_user.role in (RoleUtilisateur.magasinier, RoleUtilisateur.responsable):
        q = q.where(Reception.magasin_id == current_user.magasin_id)

    if statut:
        q = q.where(Reception.statut == statut)
    if fournisseur:
        q = q.where(Reception.fournisseur_nom.ilike(f"%{fournisseur}%"))

    q = q.order_by(Reception.numero_en.desc())
    result = await db.execute(q)
    return [_to_out(r) for r in result.scalars().all()]


@router.get("/{reception_id}", response_model=ReceptionDetail)
async def get_reception(
    reception_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    result = await db.execute(
        select(Reception)
        .options(
            selectinload(Reception.lignes).selectinload(LigneReception.photos),
            selectinload(Reception.valide_par),
        )
        .where(Reception.id == reception_id)
    )
    reception = result.scalar_one_or_none()
    if not reception:
        raise HTTPException(status_code=404, detail="Réception introuvable")
    require_magasin_access(reception.magasin_id, current_user)
    return _to_detail(reception)


@router.patch("/{reception_id}/saisie-aveugle", response_model=ReceptionOut)
async def toggle_saisie_aveugle(
    reception_id: int,
    payload: SaisieAveugletoggle,
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    if current_user.role not in (RoleUtilisateur.responsable, RoleUtilisateur.admin):
        raise HTTPException(status_code=403, detail="Réservé au responsable")
    result = await db.execute(
        select(Reception).options(selectinload(Reception.lignes)).where(Reception.id == reception_id)
    )
    reception = result.scalar_one_or_none()
    if not reception:
        raise HTTPException(status_code=404, detail="Réception introuvable")
    require_magasin_access(reception.magasin_id, current_user)
    _assert_editable(reception)
    reception.saisie_aveugle = payload.actif
    return _to_out(reception)


@router.patch("/{reception_id}/lignes/{ligne_id}", response_model=None)
async def update_ligne(
    reception_id: int,
    ligne_id: int,
    payload: LigneUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    result = await db.execute(select(Reception).where(Reception.id == reception_id))
    reception = result.scalar_one_or_none()
    if not reception:
        raise HTTPException(status_code=404, detail="Réception introuvable")
    require_magasin_access(reception.magasin_id, current_user)
    _assert_editable(reception)

    result2 = await db.execute(
        select(LigneReception).where(LigneReception.id == ligne_id, LigneReception.reception_id == reception_id)
    )
    ligne = result2.scalar_one_or_none()
    if not ligne:
        raise HTTPException(status_code=404, detail="Ligne introuvable")

    if payload.quantite_recue is not None:
        ligne.quantite_recue = payload.quantite_recue
    if payload.commentaire is not None:
        ligne.commentaire = payload.commentaire
    ligne.modifie_par_user_id = current_user.id
    ligne.modifie_le = datetime.now(timezone.utc)
    return {"ok": True}


@router.post("/{reception_id}/lignes", response_model=None, status_code=status.HTTP_201_CREATED)
async def add_ligne_hors_commande(
    reception_id: int,
    payload: LigneCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    result = await db.execute(select(Reception).where(Reception.id == reception_id))
    reception = result.scalar_one_or_none()
    if not reception:
        raise HTTPException(status_code=404, detail="Réception introuvable")
    require_magasin_access(reception.magasin_id, current_user)
    _assert_editable(reception)

    ligne = LigneReception(
        reception_id=reception_id,
        ajout_hors_commande=True,
        modifie_par_user_id=current_user.id,
        modifie_le=datetime.now(timezone.utc),
        **payload.model_dump(),
    )
    db.add(ligne)
    await db.flush()
    return {"id": ligne.id}


@router.post("/{reception_id}/lignes/{ligne_id}/photos", status_code=status.HTTP_201_CREATED)
async def upload_photo(
    reception_id: int,
    ligne_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    result = await db.execute(select(Reception).where(Reception.id == reception_id))
    reception = result.scalar_one_or_none()
    if not reception:
        raise HTTPException(status_code=404, detail="Réception introuvable")
    require_magasin_access(reception.magasin_id, current_user)
    _assert_editable(reception)

    content = await file.read()
    if len(content) > PHOTO_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Photo trop volumineuse (max 5 Mo)")

    ext = os.path.splitext(file.filename or "photo.jpg")[1] or ".jpg"
    filename = f"r{reception_id}_l{ligne_id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}{ext}"
    path = os.path.join(settings.STORAGE_PHOTOS, filename)
    os.makedirs(settings.STORAGE_PHOTOS, exist_ok=True)
    with open(path, "wb") as f:
        f.write(content)

    photo = PhotoLigne(ligne_reception_id=ligne_id, chemin_fichier=filename)
    db.add(photo)
    await db.flush()
    return {"id": photo.id, "chemin_fichier": filename}


@router.post("/{reception_id}/terminer", response_model=ReceptionOut)
async def terminer_saisie(
    reception_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    result = await db.execute(
        select(Reception).options(selectinload(Reception.lignes)).where(Reception.id == reception_id)
    )
    reception = result.scalar_one_or_none()
    if not reception:
        raise HTTPException(status_code=404, detail="Réception introuvable")
    require_magasin_access(reception.magasin_id, current_user)

    if reception.statut != StatutReception.en_cours:
        raise HTTPException(status_code=400, detail="Statut invalide pour cette action")

    non_saisies = [l for l in reception.lignes if l.quantite_recue is None]
    if non_saisies:
        raise HTTPException(
            status_code=422,
            detail=f"{len(non_saisies)} ligne(s) sans quantité saisie — la saisie est incomplète"
        )

    reception.statut = StatutReception.prete
    return _to_out(reception)


@router.post("/{reception_id}/valider", response_model=ReceptionOut)
async def valider_reception(
    reception_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    if current_user.role not in (RoleUtilisateur.responsable, RoleUtilisateur.admin):
        raise HTTPException(status_code=403, detail="Réservé au responsable")

    result = await db.execute(
        select(Reception)
        .options(
            selectinload(Reception.lignes).selectinload(LigneReception.photos),
            selectinload(Reception.magasin),
        )
        .where(Reception.id == reception_id)
    )
    reception = result.scalar_one_or_none()
    if not reception:
        raise HTTPException(status_code=404, detail="Réception introuvable")
    require_magasin_access(reception.magasin_id, current_user)

    if reception.statut not in (StatutReception.prete, StatutReception.en_cours):
        raise HTTPException(status_code=400, detail="Cette réception ne peut pas être validée")

    non_saisies = [l for l in reception.lignes if l.quantite_recue is None]
    if non_saisies:
        raise HTTPException(status_code=422, detail=f"{len(non_saisies)} ligne(s) sans quantité saisie")

    reception.statut = StatutReception.valide
    reception.valide_par_user_id = current_user.id
    reception.valide_le = datetime.now(timezone.utc)

    # Commit explicite avant le background task pour libérer le verrou sur la ligne.
    # Sans ça, run_post_validation ouvre une nouvelle session qui bloque sur la même ligne.
    out = _to_out(reception)
    await db.commit()

    from app.tasks.post_validation import run_post_validation
    background_tasks.add_task(run_post_validation, reception_id)

    return out


@router.get("/{reception_id}/pdf")
async def get_pdf(
    reception_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    result = await db.execute(select(Reception).where(Reception.id == reception_id))
    reception = result.scalar_one_or_none()
    if not reception:
        raise HTTPException(status_code=404, detail="Réception introuvable")
    require_magasin_access(reception.magasin_id, current_user)
    if not reception.pdf_path or not os.path.exists(reception.pdf_path):
        raise HTTPException(status_code=404, detail="PDF non disponible")
    return FileResponse(reception.pdf_path, media_type="application/pdf")
