from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Enum, ForeignKey,
    Integer, String, Text, UniqueConstraint, JSON,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class RoleUtilisateur(str, PyEnum):
    magasinier = "magasinier"
    responsable = "responsable"
    achats = "achats"
    admin = "admin"


class StatutReception(str, PyEnum):
    en_cours = "en_cours"
    prete = "prete"
    valide = "valide"
    envoye = "envoye"
    archive = "archive"


class SourceCodeBarre(str, PyEnum):
    import_ = "import"
    ajout_terrain = "ajout_terrain"


class StatutImport(str, PyEnum):
    en_cours = "en_cours"
    succes = "succes"
    erreur = "erreur"


class TypeImport(str, PyEnum):
    receptions = "receptions"
    codes_barres = "codes_barres"


# ---------------------------------------------------------------------------
# Societe
# ---------------------------------------------------------------------------
class Societe(Base):
    __tablename__ = "societe"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nom: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)

    magasins: Mapped[list["Magasin"]] = relationship(back_populates="societe")


# ---------------------------------------------------------------------------
# Magasin
# ---------------------------------------------------------------------------
class Magasin(Base):
    __tablename__ = "magasin"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    societe_id: Mapped[int] = mapped_column(ForeignKey("societe.id"), nullable=False)
    nom: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    mail_destinataire: Mapped[Optional[str]] = mapped_column(String(320))
    actif: Mapped[bool] = mapped_column(Boolean, default=True)

    societe: Mapped["Societe"] = relationship(back_populates="magasins")
    utilisateurs: Mapped[list["Utilisateur"]] = relationship(back_populates="magasin")
    receptions: Mapped[list["Reception"]] = relationship(back_populates="magasin")


# ---------------------------------------------------------------------------
# Utilisateur
# ---------------------------------------------------------------------------
class Utilisateur(Base):
    __tablename__ = "utilisateur"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    magasin_id: Mapped[Optional[int]] = mapped_column(ForeignKey("magasin.id"), nullable=True)
    nom: Mapped[str] = mapped_column(String(100), nullable=False)
    prenom: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[RoleUtilisateur] = mapped_column(Enum(RoleUtilisateur), nullable=False)
    pin_hash: Mapped[Optional[str]] = mapped_column(String(200))
    password_hash: Mapped[Optional[str]] = mapped_column(String(200))
    actif: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    magasin: Mapped[Optional["Magasin"]] = relationship(back_populates="utilisateurs")


# ---------------------------------------------------------------------------
# Article
# ---------------------------------------------------------------------------
class Article(Base):
    __tablename__ = "article"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference_interne: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    designation: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    codes_barres: Mapped[list["CodeBarre"]] = relationship(back_populates="article", cascade="all, delete-orphan")
    lignes: Mapped[list["LigneReception"]] = relationship(back_populates="article")


# ---------------------------------------------------------------------------
# CodeBarre
# ---------------------------------------------------------------------------
class CodeBarre(Base):
    __tablename__ = "code_barre"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("article.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    source: Mapped[SourceCodeBarre] = mapped_column(Enum(SourceCodeBarre, values_callable=lambda x: [e.value for e in x]), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("utilisateur.id"), nullable=True)

    article: Mapped["Article"] = relationship(back_populates="codes_barres")
    created_by: Mapped[Optional["Utilisateur"]] = relationship(foreign_keys=[created_by_user_id])


# ---------------------------------------------------------------------------
# Reception
# ---------------------------------------------------------------------------
class Reception(Base):
    __tablename__ = "reception"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    numero_en: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    magasin_id: Mapped[int] = mapped_column(ForeignKey("magasin.id"), nullable=False)
    code_fournisseur: Mapped[str] = mapped_column(String(100), nullable=False)
    fournisseur_nom: Mapped[str] = mapped_column(String(300), nullable=False)
    num_facture_fournisseur: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    source_filename: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, unique=True)
    date_import: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    statut: Mapped[StatutReception] = mapped_column(Enum(StatutReception), default=StatutReception.en_cours)
    saisie_aveugle: Mapped[bool] = mapped_column(Boolean, default=True)
    cree_par_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("utilisateur.id"), nullable=True)
    valide_par_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("utilisateur.id"), nullable=True)
    valide_le: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    envoye_le: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pdf_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    hash_fichier_source: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    magasin: Mapped["Magasin"] = relationship(back_populates="receptions")
    cree_par: Mapped[Optional["Utilisateur"]] = relationship(foreign_keys=[cree_par_user_id])
    valide_par: Mapped[Optional["Utilisateur"]] = relationship(foreign_keys=[valide_par_user_id])
    lignes: Mapped[list["LigneReception"]] = relationship(back_populates="reception", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# LigneReception
# ---------------------------------------------------------------------------
class LigneReception(Base):
    __tablename__ = "ligne_reception"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reception_id: Mapped[int] = mapped_column(ForeignKey("reception.id"), nullable=False)
    article_id: Mapped[Optional[int]] = mapped_column(ForeignKey("article.id"), nullable=True)
    reference_interne: Mapped[str] = mapped_column(String(100), nullable=False)
    reference_fournisseur: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    designation: Mapped[str] = mapped_column(String(500), nullable=False)
    quantite_attendue: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    quantite_recue: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ajout_hors_commande: Mapped[bool] = mapped_column(Boolean, default=False)
    modifie_par_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("utilisateur.id"), nullable=True)
    modifie_le: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    commentaire: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    reception: Mapped["Reception"] = relationship(back_populates="lignes")
    article: Mapped[Optional["Article"]] = relationship(back_populates="lignes")
    modifie_par: Mapped[Optional["Utilisateur"]] = relationship(foreign_keys=[modifie_par_user_id])
    photos: Mapped[list["PhotoLigne"]] = relationship(back_populates="ligne", cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# PhotoLigne
# ---------------------------------------------------------------------------
class PhotoLigne(Base):
    __tablename__ = "photo_ligne"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ligne_reception_id: Mapped[int] = mapped_column(ForeignKey("ligne_reception.id"), nullable=False)
    chemin_fichier: Mapped[str] = mapped_column(String(500), nullable=False)
    commentaire: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    ligne: Mapped["LigneReception"] = relationship(back_populates="photos")


# ---------------------------------------------------------------------------
# ImportLog
# ---------------------------------------------------------------------------
class ImportLog(Base):
    __tablename__ = "import_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[TypeImport] = mapped_column(Enum(TypeImport), nullable=False)
    fichier_nom: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    statut: Mapped[StatutImport] = mapped_column(Enum(StatutImport), default=StatutImport.en_cours)
    lignes_traitees: Mapped[int] = mapped_column(Integer, default=0)
    lignes_erreur: Mapped[int] = mapped_column(Integer, default=0)
    message_erreur: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# Parametre
# ---------------------------------------------------------------------------
class Parametre(Base):
    __tablename__ = "parametre"

    cle: Mapped[str] = mapped_column(String(100), primary_key=True)
    valeur: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)


# ---------------------------------------------------------------------------
# ReceptionArchive
# ---------------------------------------------------------------------------
class ReceptionArchive(Base):
    __tablename__ = "reception_archive"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reception_id: Mapped[int] = mapped_column(Integer, nullable=False)
    numero_en: Mapped[str] = mapped_column(String(100), nullable=False)
    magasin_id: Mapped[int] = mapped_column(Integer, nullable=False)
    fournisseur_nom: Mapped[str] = mapped_column(String(300), nullable=False)
    statut: Mapped[str] = mapped_column(String(50), nullable=False)
    valide_le: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pdf_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    lignes_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
