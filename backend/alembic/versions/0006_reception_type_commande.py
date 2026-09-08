"""Ajout colonnes type_commande, num_conteneur, commentaire_interne sur reception

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("reception", sa.Column("type_commande", sa.String(50), nullable=True))
    op.add_column("reception", sa.Column("num_conteneur", sa.String(100), nullable=True))
    op.add_column("reception", sa.Column("commentaire_interne", sa.String(500), nullable=True))


def downgrade():
    op.drop_column("reception", "commentaire_interne")
    op.drop_column("reception", "num_conteneur")
    op.drop_column("reception", "type_commande")
