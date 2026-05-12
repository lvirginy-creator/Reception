"""
Import FTP quotidien des fichiers réceptions et codes-barres.

Réceptions : <N°EN>_<Magasin>_<CodeFournisseur>.xlsx
Codes-barres : fichier unique (remplacement intelligent).
"""
import os
import re
import io
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import IO

import openpyxl
from loguru import logger
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.models import (
    Article, CodeBarre, ImportLog, LigneReception,
    Magasin, Reception, SourceCodeBarre, StatutImport,
    StatutReception, TypeImport,
)

settings = get_settings()

# Regex pour le nom de fichier réception
RECEPTION_FILENAME_RE = re.compile(
    r"^(?P<numero_en>[^_]+)_(?P<magasin_code>[^_]+)_(?P<code_fournisseur>.+)\.xlsx$",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Connecteur FTP/SFTP
# ---------------------------------------------------------------------------

def _get_ftp_client():
    if settings.FTP_USE_SFTP:
        import paramiko
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(
            hostname=settings.FTP_HOST,
            port=settings.FTP_PORT,
            username=settings.FTP_USER,
            password=settings.FTP_PASSWORD,
            timeout=30,
        )
        return ssh.open_sftp(), ssh
    else:
        import ftplib

        # FileZilla Server exige la reprise de session TLS sur le canal de données.
        # ftplib.FTP_TLS ne le fait pas nativement — on sous-classe pour passer
        # la session TLS du canal de contrôle au canal de données.
        class _FTPTLSResuming(ftplib.FTP_TLS):
            def ntransfercmd(self, cmd, rest=None):
                conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
                if self._prot_p:
                    conn = self.context.wrap_socket(
                        conn,
                        server_hostname=self.host,
                        session=self.sock.session,
                    )
                return conn, size

        ftp = _FTPTLSResuming()
        ftp.connect(settings.FTP_HOST, settings.FTP_PORT, timeout=30)
        ftp.login(settings.FTP_USER, settings.FTP_PASSWORD)
        ftp.prot_p()
        return ftp, None


def _list_files(client, path: str) -> list[str]:
    if hasattr(client, "listdir"):  # SFTP
        return client.listdir(path)
    else:  # FTP
        return client.nlst(path)


def _read_file(client, remote_path: str) -> bytes:
    if hasattr(client, "open"):  # SFTP
        with client.open(remote_path, "rb") as f:
            return f.read()
    else:  # FTP
        buf = io.BytesIO()
        client.retrbinary(f"RETR {remote_path}", buf.write)
        return buf.getvalue()


def _move_file(client, src: str, dst_dir: str, filename: str):
    if hasattr(client, "rename"):  # SFTP
        try:
            client.mkdir(dst_dir)
        except OSError:
            pass
        client.rename(src, f"{dst_dir}/{filename}")
    else:  # FTP
        try:
            client.mkd(dst_dir)
        except Exception:
            pass
        client.rename(src, f"{dst_dir}/{filename}")


# ---------------------------------------------------------------------------
# Import réceptions
# ---------------------------------------------------------------------------

async def import_receptions(db: AsyncSession) -> ImportLog:
    log = ImportLog(type=TypeImport.receptions, statut=StatutImport.en_cours)
    db.add(log)
    await db.flush()

    if not settings.FTP_HOST:
        log.statut = StatutImport.erreur
        log.message_erreur = "FTP_HOST non configuré"
        log.ended_at = datetime.now(timezone.utc)
        return log

    try:
        client, ssh = _get_ftp_client()
        ftp_path = settings.FTP_PATH_RECEPTIONS

        files = [f for f in _list_files(client, ftp_path) if f.lower().endswith(".xlsx")]
        logger.info(f"Import réceptions : {len(files)} fichier(s) trouvé(s)")

        lignes_traitees = 0
        lignes_erreur = 0

        for filename in files:
            m = RECEPTION_FILENAME_RE.match(filename)
            if not m:
                logger.warning(f"Nom de fichier non reconnu : {filename}")
                lignes_erreur += 1
                continue

            numero_en = m.group("numero_en")
            magasin_code = m.group("magasin_code")
            code_fournisseur = m.group("code_fournisseur")

            # Résoudre le magasin
            r = await db.execute(select(Magasin).where(Magasin.code == magasin_code))
            magasin = r.scalar_one_or_none()
            if not magasin:
                logger.warning(f"Magasin '{magasin_code}' introuvable pour {filename}")
                lignes_erreur += 1
                continue

            # Vérifier doublon (règle C5)
            r2 = await db.execute(
                select(Reception).where(
                    Reception.numero_en == numero_en,
                    Reception.magasin_id == magasin.id,
                )
            )
            if r2.scalar_one_or_none():
                logger.info(f"Réception {numero_en}/{magasin_code} déjà importée, ignorée")
                # Archiver quand même pour ne pas retraiter
                _archive_file(client, ftp_path, filename)
                continue

            # Lire le fichier
            try:
                content = _read_file(client, f"{ftp_path}/{filename}")
                nb = await _process_reception_file(
                    db, content, numero_en, magasin, code_fournisseur
                )
                lignes_traitees += nb
            except Exception as e:
                logger.error(f"Erreur traitement {filename}: {e}")
                lignes_erreur += 1
                continue

            _archive_file(client, ftp_path, filename)

        if hasattr(client, "close"):
            client.close()
        if ssh:
            ssh.close()

        log.statut = StatutImport.succes
        log.lignes_traitees = lignes_traitees
        log.lignes_erreur = lignes_erreur

    except Exception as e:
        log.statut = StatutImport.erreur
        log.message_erreur = str(e)
        logger.error(f"Import réceptions échoué : {e}")

    log.ended_at = datetime.now(timezone.utc)
    return log


def _archive_file(client, ftp_path: str, filename: str):
    now = datetime.now(timezone.utc)
    archive_dir = f"{ftp_path}/archive/{now.strftime('%Y-%m')}"
    try:
        _move_file(client, f"{ftp_path}/{filename}", archive_dir, filename)
    except Exception as e:
        logger.warning(f"Impossible d'archiver {filename}: {e}")


async def _process_reception_file(
    db: AsyncSession,
    content: bytes,
    numero_en: str,
    magasin: Magasin,
    code_fournisseur: str,
) -> int:
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(min_row=2, values_only=True))
    if not rows:
        return 0

    # Détecter le nom du fournisseur depuis la première ligne non vide
    fournisseur_nom = ""
    for row in rows:
        if row and len(row) >= 3 and row[2]:
            fournisseur_nom = str(row[2]).strip()
            break

    reception = Reception(
        numero_en=numero_en,
        magasin_id=magasin.id,
        code_fournisseur=code_fournisseur,
        fournisseur_nom=fournisseur_nom,
        statut=StatutReception.en_cours,
        saisie_aveugle=True,
    )
    db.add(reception)
    await db.flush()

    nb = 0
    for row in rows:
        if not row or not any(row):
            continue
        # Colonnes : Société, Code fournisseur, Fournisseur, Réf interne,
        #            Réf fournisseur, Désignation, Quantité attendue
        try:
            reference_interne = str(row[3]).strip() if row[3] else None
            reference_fournisseur = str(row[4]).strip() if len(row) > 4 and row[4] else None
            designation = str(row[5]).strip() if len(row) > 5 and row[5] else "Sans désignation"
            quantite_attendue = int(row[6]) if len(row) > 6 and row[6] else None
        except (ValueError, IndexError):
            continue

        if not reference_interne:
            continue

        # Résoudre ou créer l'article
        r = await db.execute(select(Article).where(Article.reference_interne == reference_interne))
        article = r.scalar_one_or_none()
        if not article:
            article = Article(reference_interne=reference_interne, designation=designation)
            db.add(article)
            await db.flush()

        ligne = LigneReception(
            reception_id=reception.id,
            article_id=article.id,
            reference_interne=reference_interne,
            reference_fournisseur=reference_fournisseur,
            designation=designation,
            quantite_attendue=quantite_attendue,
        )
        db.add(ligne)
        nb += 1

    await db.flush()
    return nb


# ---------------------------------------------------------------------------
# Import codes-barres (remplacement intelligent)
# ---------------------------------------------------------------------------

async def import_codes_barres(db: AsyncSession) -> ImportLog:
    log = ImportLog(type=TypeImport.codes_barres, statut=StatutImport.en_cours)
    db.add(log)
    await db.flush()

    if not settings.FTP_HOST:
        log.statut = StatutImport.erreur
        log.message_erreur = "FTP_HOST non configuré"
        log.ended_at = datetime.now(timezone.utc)
        return log

    try:
        client, ssh = _get_ftp_client()
        ftp_path = settings.FTP_PATH_CODES_BARRES

        files = [f for f in _list_files(client, ftp_path) if f.lower().endswith(".xlsx")]
        if not files:
            log.statut = StatutImport.succes
            log.message_erreur = "Aucun fichier codes-barres trouvé"
            log.ended_at = datetime.now(timezone.utc)
            if hasattr(client, "close"):
                client.close()
            if ssh:
                ssh.close()
            return log

        # Prendre le fichier le plus récent
        filename = files[-1]
        log.fichier_nom = filename
        content = _read_file(client, f"{ftp_path}/{filename}")

        if hasattr(client, "close"):
            client.close()
        if ssh:
            ssh.close()

        nb_traites, nb_erreurs = await _process_codes_barres_file(db, content)
        log.statut = StatutImport.succes
        log.lignes_traitees = nb_traites
        log.lignes_erreur = nb_erreurs

    except Exception as e:
        log.statut = StatutImport.erreur
        log.message_erreur = str(e)
        logger.error(f"Import codes-barres échoué : {e}")

    log.ended_at = datetime.now(timezone.utc)
    return log


async def _process_codes_barres_file(db: AsyncSession, content: bytes) -> tuple[int, int]:
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    ws = wb.active

    # Charger tout le fichier : {reference_interne: [code1, code2, ...]}
    file_data: dict[str, list[str]] = {}
    nb_erreurs = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[0] or not row[1]:
            continue
        ref = str(row[0]).strip()
        code = str(row[1]).strip()
        if ref and code:
            file_data.setdefault(ref, []).append(code)

    # Collecter tous les codes du fichier dans un set
    all_file_codes = {code for codes in file_data.values() for code in codes}

    # Upsert : pour chaque (ref, code) du fichier
    nb_traites = 0
    for ref, codes in file_data.items():
        r = await db.execute(select(Article).where(Article.reference_interne == ref))
        article = r.scalar_one_or_none()
        if not article:
            logger.debug(f"Article {ref} inconnu, ignoré pour les codes-barres")
            nb_erreurs += 1
            continue

        for code in codes:
            r2 = await db.execute(select(CodeBarre).where(CodeBarre.code == code))
            existing = r2.scalar_one_or_none()
            if existing:
                # Mettre à jour si c'est un import (ne pas toucher aux ajouts terrain)
                if existing.source == SourceCodeBarre.import_:
                    existing.article_id = article.id
            else:
                cb = CodeBarre(
                    article_id=article.id,
                    code=code,
                    source=SourceCodeBarre.import_,
                )
                db.add(cb)
            nb_traites += 1

    await db.flush()

    # Supprimer les codes source='import' qui ne sont plus dans le fichier
    r = await db.execute(
        select(CodeBarre).where(CodeBarre.source == SourceCodeBarre.import_)
    )
    codes_import = r.scalars().all()
    for cb in codes_import:
        if cb.code not in all_file_codes:
            await db.delete(cb)

    await db.flush()
    return nb_traites, nb_erreurs


# ---------------------------------------------------------------------------
# Point d'entrée unique appelé par le scheduler
# ---------------------------------------------------------------------------

async def run_all_imports():
    async with AsyncSessionLocal() as db:
        try:
            logger.info("=== Démarrage import FTP ===")
            log_rec = await import_receptions(db)
            log_cb = await import_codes_barres(db)
            await db.commit()
            logger.info(
                f"Import terminé — Réceptions: {log_rec.statut.value}, "
                f"Codes-barres: {log_cb.statut.value}"
            )
        except Exception as e:
            await db.rollback()
            logger.error(f"Erreur import global : {e}")
