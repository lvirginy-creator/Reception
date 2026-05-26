"""Génération du rapport d'écart PDF via WeasyPrint."""
import os
from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML, CSS
from loguru import logger

from app.core.config import get_settings
from app.core.security import sha256_file
from app.models.models import Reception, LigneReception

settings = get_settings()

_template_dir = Path(__file__).parent.parent / "templates"
_jinja_env = Environment(loader=FileSystemLoader(str(_template_dir)), autoescape=True)


def _ecart(ligne: LigneReception) -> int | None:
    if ligne.quantite_attendue is None or ligne.quantite_recue is None:
        return None
    return ligne.quantite_recue - ligne.quantite_attendue


def generate_pdf(reception: Reception, validateur_nom: str) -> str:
    """
    Génère le PDF d'écart, le stocke dans STORAGE_PDF et retourne le chemin absolu.
    """
    os.makedirs(settings.STORAGE_PDF, exist_ok=True)

    # Calculer les stats
    lignes_conformes = []
    lignes_ecart = []
    lignes_hors_commande = []
    for ligne in reception.lignes:
        if ligne.ajout_hors_commande:
            lignes_hors_commande.append(ligne)
        elif _ecart(ligne) == 0:
            lignes_conformes.append(ligne)
        else:
            lignes_ecart.append(ligne)

    context = {
        "reception": reception,
        "magasin": reception.magasin,
        "societe_nom": reception.magasin.societe.nom if reception.magasin.societe else "Groupe Caraïbes Distribution",
        "lignes": reception.lignes,
        "validateur_nom": validateur_nom,
        "date_validation": reception.valide_le or datetime.now(timezone.utc),
        "nb_conformes": len(lignes_conformes),
        "nb_ecarts": len(lignes_ecart),
        "nb_hors_commande": len(lignes_hors_commande),
        "ecart_fn": _ecart,
        "STORAGE_PHOTOS": settings.STORAGE_PHOTOS,
    }

    template = _jinja_env.get_template("rapport_ecart.html")
    html_content = template.render(**context)

    filename = f"reception_{reception.numero_en}_{reception.magasin_id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.pdf"
    pdf_path = os.path.join(settings.STORAGE_PDF, filename)

    try:
        HTML(string=html_content, base_url=str(_template_dir)).write_pdf(pdf_path)
        logger.info(f"PDF généré : {pdf_path}")
    except Exception as e:
        logger.error(f"Erreur génération PDF : {e}")
        raise

    return pdf_path
