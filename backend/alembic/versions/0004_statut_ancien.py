"""Ajout valeur 'ancien' à l'enum statutreception

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-02
"""
from typing import Union
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE statutreception ADD VALUE IF NOT EXISTS 'ancien'")


def downgrade() -> None:
    # PostgreSQL ne permet pas de supprimer une valeur d'enum
    pass
