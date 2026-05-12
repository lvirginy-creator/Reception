"""APScheduler — import quotidien à 6h00 + archivage mensuel."""
import asyncio
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.models import (
    Reception, LigneReception, PhotoLigne,
    ReceptionArchive, StatutReception,
)
from app.services.import_ftp import run_all_imports

scheduler = AsyncIOScheduler(timezone="America/Guadeloupe")


async def _archive_old_receptions():
    """
    Archivage mensuel : réceptions plus anciennes que fin du mois précédent.
    Copie les données en reception_archive, supprime photos disque.
    """
    import os
    from app.core.config import get_settings
    settings = get_settings()

    now = datetime.now(timezone.utc)
    # Fin du mois précédent = 1er du mois courant - 1 seconde
    cutoff = datetime(now.year, now.month, 1, tzinfo=timezone.utc) - timedelta(seconds=1)

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(Reception)
                .options(selectinload(Reception.lignes).selectinload(LigneReception.photos))
                .where(
                    Reception.date_import < cutoff,
                    Reception.statut.in_([StatutReception.envoye, StatutReception.valide]),
                )
            )
            receptions = result.scalars().all()

            if not receptions:
                logger.info("Archivage mensuel : aucune réception à archiver")
                return

            logger.info(f"Archivage mensuel : {len(receptions)} réception(s)")

            for r in receptions:
                # Sérialiser les lignes en JSON
                lignes_json = [
                    {
                        "id": l.id,
                        "reference_interne": l.reference_interne,
                        "designation": l.designation,
                        "quantite_attendue": l.quantite_attendue,
                        "quantite_recue": l.quantite_recue,
                        "commentaire": l.commentaire,
                        "ajout_hors_commande": l.ajout_hors_commande,
                    }
                    for l in r.lignes
                ]

                archive = ReceptionArchive(
                    reception_id=r.id,
                    numero_en=r.numero_en,
                    magasin_id=r.magasin_id,
                    fournisseur_nom=r.fournisseur_nom,
                    statut=r.statut.value,
                    valide_le=r.valide_le,
                    pdf_path=r.pdf_path,
                    lignes_json=lignes_json,
                )
                db.add(archive)

                # Supprimer les photos du disque (garder le PDF 12 mois)
                for ligne in r.lignes:
                    for photo in ligne.photos:
                        photo_path = os.path.join(settings.STORAGE_PHOTOS, photo.chemin_fichier)
                        if os.path.exists(photo_path):
                            try:
                                os.remove(photo_path)
                            except Exception:
                                pass

                await db.delete(r)

            await db.commit()
            logger.info(f"Archivage terminé : {len(receptions)} réception(s) archivée(s)")

        except Exception as e:
            await db.rollback()
            logger.error(f"Erreur archivage mensuel : {e}")


def start_scheduler():
    # Import FTP quotidien à 6h00 heure Guadeloupe
    scheduler.add_job(
        run_all_imports,
        CronTrigger(hour=6, minute=0),
        id="import_ftp_quotidien",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # Archivage mensuel le 1er de chaque mois à 3h00
    scheduler.add_job(
        _archive_old_receptions,
        CronTrigger(day=1, hour=3, minute=0),
        id="archivage_mensuel",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    scheduler.start()
    logger.info("APScheduler démarré (import 6h00, archivage J+1 de chaque mois)")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
