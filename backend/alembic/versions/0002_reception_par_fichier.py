"""reception par fichier source

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-19 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ajout du numéro de facture fournisseur
    op.add_column("reception", sa.Column("num_facture_fournisseur", sa.String(100), nullable=True))

    # Ajout du nom du fichier source (clé de déduplication par fichier)
    op.add_column("reception", sa.Column("source_filename", sa.String(500), nullable=True))
    op.create_unique_constraint("uq_reception_source_filename", "reception", ["source_filename"])

    # Suppression de l'ancienne contrainte unique (numero_en, magasin_id)
    # car plusieurs fichiers du même EN peuvent coexister (fournisseurs/factures différents)
    op.drop_constraint("uq_reception_en_magasin", "reception", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("uq_reception_en_magasin", "reception", ["numero_en", "magasin_id"])
    op.drop_constraint("uq_reception_source_filename", "reception", type_="unique")
    op.drop_column("reception", "source_filename")
    op.drop_column("reception", "num_facture_fournisseur")
