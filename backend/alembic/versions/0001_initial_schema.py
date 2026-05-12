"""initial schema

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enums
    role_enum = postgresql.ENUM(
        "magasinier", "responsable", "achats", "admin",
        name="roleutilisateur", create_type=True
    )
    statut_reception_enum = postgresql.ENUM(
        "en_cours", "prete", "valide", "envoye", "archive",
        name="statutreception", create_type=True
    )
    source_cb_enum = postgresql.ENUM(
        "import", "ajout_terrain",
        name="sourcecodebarre", create_type=True
    )
    statut_import_enum = postgresql.ENUM(
        "en_cours", "succes", "erreur",
        name="statutimport", create_type=True
    )
    type_import_enum = postgresql.ENUM(
        "receptions", "codes_barres",
        name="typeimport", create_type=True
    )

    op.create_table(
        "societe",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nom", sa.String(200), nullable=False),
        sa.Column("code", sa.String(20), unique=True, nullable=False),
    )

    op.create_table(
        "magasin",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("societe_id", sa.Integer(), sa.ForeignKey("societe.id"), nullable=False),
        sa.Column("nom", sa.String(200), nullable=False),
        sa.Column("code", sa.String(20), unique=True, nullable=False),
        sa.Column("mail_destinataire", sa.String(320), nullable=True),
        sa.Column("actif", sa.Boolean(), default=True),
    )

    op.create_table(
        "utilisateur",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("magasin_id", sa.Integer(), sa.ForeignKey("magasin.id"), nullable=True),
        sa.Column("nom", sa.String(100), nullable=False),
        sa.Column("prenom", sa.String(100), nullable=False),
        sa.Column("role", sa.Enum("magasinier", "responsable", "achats", "admin", name="roleutilisateur", create_type=False), nullable=False),
        sa.Column("pin_hash", sa.String(200), nullable=True),
        sa.Column("password_hash", sa.String(200), nullable=True),
        sa.Column("actif", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "article",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reference_interne", sa.String(100), unique=True, nullable=False),
        sa.Column("designation", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_article_reference_interne", "article", ["reference_interne"])

    op.create_table(
        "code_barre",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("article_id", sa.Integer(), sa.ForeignKey("article.id"), nullable=False),
        sa.Column("code", sa.String(200), unique=True, nullable=False),
        sa.Column("source", sa.Enum("import", "ajout_terrain", name="sourcecodebarre", create_type=False), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("utilisateur.id"), nullable=True),
    )
    op.create_index("ix_code_barre_code", "code_barre", ["code"])

    op.create_table(
        "reception",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("numero_en", sa.String(100), nullable=False),
        sa.Column("magasin_id", sa.Integer(), sa.ForeignKey("magasin.id"), nullable=False),
        sa.Column("code_fournisseur", sa.String(100), nullable=False),
        sa.Column("fournisseur_nom", sa.String(300), nullable=False),
        sa.Column("date_import", sa.DateTime(timezone=True), nullable=False),
        sa.Column("statut", sa.Enum("en_cours", "prete", "valide", "envoye", "archive", name="statutreception", create_type=False), nullable=False),
        sa.Column("saisie_aveugle", sa.Boolean(), default=True),
        sa.Column("cree_par_user_id", sa.Integer(), sa.ForeignKey("utilisateur.id"), nullable=True),
        sa.Column("valide_par_user_id", sa.Integer(), sa.ForeignKey("utilisateur.id"), nullable=True),
        sa.Column("valide_le", sa.DateTime(timezone=True), nullable=True),
        sa.Column("envoye_le", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pdf_path", sa.String(500), nullable=True),
        sa.Column("hash_fichier_source", sa.String(64), nullable=True),
        sa.UniqueConstraint("numero_en", "magasin_id", name="uq_reception_en_magasin"),
    )
    op.create_index("ix_reception_numero_en", "reception", ["numero_en"])

    op.create_table(
        "ligne_reception",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reception_id", sa.Integer(), sa.ForeignKey("reception.id"), nullable=False),
        sa.Column("article_id", sa.Integer(), sa.ForeignKey("article.id"), nullable=True),
        sa.Column("reference_interne", sa.String(100), nullable=False),
        sa.Column("reference_fournisseur", sa.String(100), nullable=True),
        sa.Column("designation", sa.String(500), nullable=False),
        sa.Column("quantite_attendue", sa.Integer(), nullable=True),
        sa.Column("quantite_recue", sa.Integer(), nullable=True),
        sa.Column("ajout_hors_commande", sa.Boolean(), default=False),
        sa.Column("modifie_par_user_id", sa.Integer(), sa.ForeignKey("utilisateur.id"), nullable=True),
        sa.Column("modifie_le", sa.DateTime(timezone=True), nullable=True),
        sa.Column("commentaire", sa.Text(), nullable=True),
    )

    op.create_table(
        "photo_ligne",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ligne_reception_id", sa.Integer(), sa.ForeignKey("ligne_reception.id"), nullable=False),
        sa.Column("chemin_fichier", sa.String(500), nullable=False),
        sa.Column("commentaire", sa.Text(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "import_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("type", sa.Enum("receptions", "codes_barres", name="typeimport", create_type=False), nullable=False),
        sa.Column("fichier_nom", sa.String(500), nullable=True),
        sa.Column("statut", sa.Enum("en_cours", "succes", "erreur", name="statutimport", create_type=False), nullable=False),
        sa.Column("lignes_traitees", sa.Integer(), default=0),
        sa.Column("lignes_erreur", sa.Integer(), default=0),
        sa.Column("message_erreur", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "parametre",
        sa.Column("cle", sa.String(100), primary_key=True),
        sa.Column("valeur", postgresql.JSONB(), nullable=True),
    )

    op.create_table(
        "reception_archive",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reception_id", sa.Integer(), nullable=False),
        sa.Column("numero_en", sa.String(100), nullable=False),
        sa.Column("magasin_id", sa.Integer(), nullable=False),
        sa.Column("fournisseur_nom", sa.String(300), nullable=False),
        sa.Column("statut", sa.String(50), nullable=False),
        sa.Column("valide_le", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pdf_path", sa.String(500), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lignes_json", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("reception_archive")
    op.drop_table("parametre")
    op.drop_table("import_log")
    op.drop_table("photo_ligne")
    op.drop_table("ligne_reception")
    op.drop_table("reception")
    op.drop_table("code_barre")
    op.drop_table("article")
    op.drop_table("utilisateur")
    op.drop_table("magasin")
    op.drop_table("societe")

    for enum_name in ["roleutilisateur", "statutreception", "sourcecodebarre", "statutimport", "typeimport"]:
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
