"""Tâche exécutée après validation : génération PDF + envoi mail."""
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.core.security import sha256_file
from app.models.models import (
    CodeBarre, LigneReception, Reception, SourceCodeBarre, StatutReception,
)
from app.services.mailer import send_validation_mail
from app.services.pdf_generator import generate_pdf


async def run_post_validation(reception_id: int):
    """
    Lance la génération PDF + envoi mail pour une réception validée.
    Utilise une session fraîche pour éviter les problèmes de session expirée.
    """
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(Reception)
                .options(
                    selectinload(Reception.lignes).selectinload(LigneReception.photos),
                    selectinload(Reception.magasin),
                    selectinload(Reception.valide_par),
                )
                .where(Reception.id == reception_id)
            )
            reception = result.scalar_one_or_none()
            if not reception:
                logger.error(f"post_validation: réception {reception_id} introuvable")
                return

            validateur_nom = (
                f"{reception.valide_par.prenom} {reception.valide_par.nom}"
                if reception.valide_par
                else "Inconnu"
            )

            # Collecter les nouveaux codes-barres (ajout_terrain) de cette réception
            nouveaux_codes: list[dict] = []
            for ligne in reception.lignes:
                r = await db.execute(
                    select(CodeBarre)
                    .where(
                        CodeBarre.article_id == ligne.article_id,
                        CodeBarre.source == SourceCodeBarre.ajout_terrain,
                    )
                )
                for cb in r.scalars().all():
                    createur = ""
                    if cb.created_by:
                        createur = f"{cb.created_by.prenom} {cb.created_by.nom}"
                    nouveaux_codes.append({
                        "reference_interne": ligne.reference_interne,
                        "reference_fournisseur": ligne.reference_fournisseur,
                        "designation": ligne.designation,
                        "code": cb.code,
                        "date": cb.created_at.strftime("%d/%m/%Y %H:%M"),
                        "saisi_par": createur,
                    })

            # Générer le PDF
            pdf_path = generate_pdf(reception, validateur_nom)
            reception.pdf_path = pdf_path
            reception.hash_fichier_source = sha256_file(pdf_path)

            # Envoyer le mail
            sent = send_validation_mail(reception, pdf_path, nouveaux_codes)
            if sent:
                reception.statut = StatutReception.envoye
                reception.envoye_le = datetime.now(timezone.utc)

            await db.commit()
            logger.info(f"post_validation OK pour réception {reception_id}")

        except Exception as e:
            await db.rollback()
            logger.error(f"post_validation erreur pour réception {reception_id}: {e}")
