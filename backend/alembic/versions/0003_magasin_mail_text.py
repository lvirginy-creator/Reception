"""magasin mail_destinataire : String(320) -> Text

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-20
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "magasin", "mail_destinataire",
        existing_type=sa.String(320),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "magasin", "mail_destinataire",
        existing_type=sa.Text(),
        type_=sa.String(320),
        existing_nullable=True,
    )
