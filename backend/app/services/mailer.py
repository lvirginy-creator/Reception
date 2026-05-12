"""Envoi des mails de validation via smtplib."""
import io
import smtplib
import ssl
from datetime import datetime, timezone
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import openpyxl
from loguru import logger

from app.core.config import get_settings
from app.models.models import CodeBarre, LigneReception, Reception, SourceCodeBarre

settings = get_settings()


def _smtp_connection():
    if settings.SMTP_USE_TLS:
        context = ssl.create_default_context()
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30)
        server.ehlo()
        server.starttls(context=context)
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30)
    if settings.SMTP_USER:
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
    return server


def send_validation_mail(
    reception: Reception,
    pdf_path: str,
    nouveaux_codes_barres: list[dict],
) -> bool:
    """
    Envoie le mail de validation + PDF au magasin (Cc achats).
    Si nouveaux_codes_barres est non vide, envoie un second mail au service achats.
    """
    if not settings.SMTP_HOST:
        logger.warning("SMTP non configuré, mail non envoyé")
        return False

    date_str = (reception.valide_le or datetime.now(timezone.utc)).strftime("%d/%m/%Y")
    magasin_nom = reception.magasin.nom if reception.magasin else str(reception.magasin_id)

    # --- Mail principal ---
    msg = MIMEMultipart()
    msg["From"] = settings.SMTP_USER
    msg["To"] = reception.magasin.mail_destinataire or settings.MAIL_ACHATS
    msg["Cc"] = settings.MAIL_ACHATS
    msg["Subject"] = (
        f"[{magasin_nom}] Réception EN {reception.numero_en} "
        f"– {reception.fournisseur_nom} – {date_str}"
    )

    # Corps
    nb_ecarts = sum(
        1 for l in reception.lignes
        if not l.ajout_hors_commande
        and l.quantite_attendue is not None
        and l.quantite_recue is not None
        and l.quantite_recue != l.quantite_attendue
    )
    mention_ecart = f"\n\nATTENTION : {nb_ecarts} écart(s) constaté(s)." if nb_ecarts else "\n\nAucun écart constaté."

    body = (
        f"Bonjour,\n\n"
        f"La réception N° {reception.numero_en} du fournisseur {reception.fournisseur_nom} "
        f"pour le magasin {magasin_nom} a été validée le {date_str}."
        f"{mention_ecart}\n\n"
        f"Veuillez trouver ci-joint le rapport d'écart signé.\n\n"
        f"Cordialement,\nApplication de réception"
    )
    msg.attach(MIMEText(body, "plain", "utf-8"))

    # PJ PDF
    with open(pdf_path, "rb") as f:
        pdf_data = f.read()
    pdf_filename = f"reception_{reception.numero_en}_{date_str.replace('/', '-')}.pdf"
    part = MIMEApplication(pdf_data, Name=pdf_filename)
    part["Content-Disposition"] = f'attachment; filename="{pdf_filename}"'
    msg.attach(part)

    try:
        with _smtp_connection() as server:
            recipients = [msg["To"]]
            if msg["Cc"] and msg["Cc"] not in recipients:
                recipients.append(msg["Cc"])
            server.sendmail(settings.SMTP_USER, recipients, msg.as_string())
        logger.info(f"Mail de validation envoyé pour réception {reception.numero_en}")
    except Exception as e:
        logger.error(f"Erreur envoi mail validation : {e}")
        return False

    # --- Mail codes-barres (si nouveaux) ---
    if nouveaux_codes_barres and settings.MAIL_ACHATS:
        try:
            _send_codes_barres_mail(reception, nouveaux_codes_barres, date_str, magasin_nom)
        except Exception as e:
            logger.error(f"Erreur envoi mail codes-barres : {e}")

    return True


def _send_codes_barres_mail(
    reception: Reception,
    nouveaux: list[dict],
    date_str: str,
    magasin_nom: str,
):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Nouveaux codes-barres"
    ws.append(["Réf interne", "Réf fournisseur", "Désignation", "Code-barres", "Date", "Saisi par"])
    for row in nouveaux:
        ws.append([
            row.get("reference_interne"),
            row.get("reference_fournisseur"),
            row.get("designation"),
            row.get("code"),
            row.get("date"),
            row.get("saisi_par"),
        ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    msg = MIMEMultipart()
    msg["From"] = settings.SMTP_USER
    msg["To"] = settings.MAIL_ACHATS
    msg["Subject"] = f"Nouveaux codes-barres associés – {magasin_nom} – {date_str}"

    msg.attach(MIMEText(
        f"Bonjour,\n\nVeuillez trouver ci-joint les {len(nouveaux)} nouveau(x) code(s)-barres "
        f"associé(s) lors de la réception {reception.numero_en} du magasin {magasin_nom}.\n\n"
        f"Cordialement,\nApplication de réception",
        "plain", "utf-8"
    ))

    xlsx_filename = f"nouveaux_codes_barres_{magasin_nom}_{date_str.replace('/', '-')}.xlsx"
    part = MIMEApplication(buf.read(), Name=xlsx_filename)
    part["Content-Disposition"] = f'attachment; filename="{xlsx_filename}"'
    msg.attach(part)

    with _smtp_connection() as server:
        server.sendmail(settings.SMTP_USER, [settings.MAIL_ACHATS], msg.as_string())
    logger.info(f"Mail codes-barres envoyé ({len(nouveaux)} entrées)")
