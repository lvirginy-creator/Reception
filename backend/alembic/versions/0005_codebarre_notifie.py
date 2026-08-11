"""Ajout colonne notifie sur code_barre

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-11
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "code_barre",
        sa.Column("notifie", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade():
    op.drop_column("code_barre", "notifie")
