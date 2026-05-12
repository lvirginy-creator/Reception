#!/usr/bin/env python3
"""
Script de seed — données de démonstration Sprint 1.

Lance avec :  python seed.py
(depuis le dossier backend/, avec la DB accessible via DATABASE_URL)
"""
import asyncio
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_pin, hash_password
from app.models.models import (
    Article, CodeBarre, LigneReception, Magasin,
    Reception, SourceCodeBarre, Societe, StatutReception,
    Utilisateur, RoleUtilisateur, Parametre,
)

settings = get_settings()


async def seed():
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as db:
        # ------------------------------------------------------------------ #
        # 1. Société
        # ------------------------------------------------------------------ #
        societe = Societe(nom="Groupe Caraïbes Distribution", code="GCD")
        db.add(societe)
        await db.flush()
        print(f"✓ Société : {societe.nom} (id={societe.id})")

        # ------------------------------------------------------------------ #
        # 2. Magasins
        # ------------------------------------------------------------------ #
        mag_pointe = Magasin(
            societe_id=societe.id,
            nom="Pointe-à-Pitre Centre",
            code="PAP",
            mail_destinataire="reception.pap@gcd.gp",
            actif=True,
        )
        mag_basse = Magasin(
            societe_id=societe.id,
            nom="Basse-Terre",
            code="BT",
            mail_destinataire="reception.bt@gcd.gp",
            actif=True,
        )
        db.add_all([mag_pointe, mag_basse])
        await db.flush()
        print(f"✓ Magasin 1 : {mag_pointe.nom} (code={mag_pointe.code})")
        print(f"✓ Magasin 2 : {mag_basse.nom} (code={mag_basse.code})")

        # ------------------------------------------------------------------ #
        # 3. Utilisateurs
        # ------------------------------------------------------------------ #
        admin = Utilisateur(
            nom="admin", prenom="Administrateur",
            role=RoleUtilisateur.admin,
            password_hash=hash_password("Admin2024!"),
            actif=True,
        )
        magasinier = Utilisateur(
            magasin_id=mag_pointe.id,
            nom="Théodore", prenom="Luc",
            role=RoleUtilisateur.magasinier,
            pin_hash=hash_pin("1234"),
            actif=True,
        )
        responsable = Utilisateur(
            magasin_id=mag_pointe.id,
            nom="Beaumont", prenom="Sophie",
            role=RoleUtilisateur.responsable,
            pin_hash=hash_pin("5678"),
            actif=True,
        )
        achats = Utilisateur(
            nom="Service", prenom="Achats",
            role=RoleUtilisateur.achats,
            pin_hash=hash_pin("9999"),
            actif=True,
        )
        db.add_all([admin, magasinier, responsable, achats])
        await db.flush()
        print(f"✓ Admin      : login=admin / mdp=Admin2024!")
        print(f"✓ Magasinier : magasin={mag_pointe.code} / PIN=1234")
        print(f"✓ Responsable: magasin={mag_pointe.code} / PIN=5678")
        print(f"✓ Achats     : PIN=9999")

        # ------------------------------------------------------------------ #
        # 4. Articles & codes-barres
        # ------------------------------------------------------------------ #
        articles_data = [
            ("ART001", "Eau minérale 1,5L pack x6"),
            ("ART002", "Jus de fruits tropical 1L"),
            ("ART003", "Farine de blé 1kg"),
            ("ART004", "Huile de tournesol 1L"),
            ("ART005", "Riz blanc long grain 5kg"),
        ]
        articles = []
        for ref, desig in articles_data:
            a = Article(reference_interne=ref, designation=desig)
            db.add(a)
            articles.append(a)
        await db.flush()

        # Quelques codes-barres d'import
        cb_data = [
            (articles[0].id, "3760001000001"),
            (articles[0].id, "3760001000002"),
            (articles[1].id, "3760002000001"),
            (articles[2].id, "3760003000001"),
            (articles[3].id, "3760004000001"),
        ]
        for art_id, code in cb_data:
            db.add(CodeBarre(article_id=art_id, code=code, source=SourceCodeBarre.import_))
        await db.flush()
        print(f"✓ {len(articles)} articles + {len(cb_data)} codes-barres")

        # ------------------------------------------------------------------ #
        # 5. Réceptions de démonstration
        # ------------------------------------------------------------------ #
        rec1 = Reception(
            numero_en="EN2024-001",
            magasin_id=mag_pointe.id,
            code_fournisseur="FOUR001",
            fournisseur_nom="Sodipro Distribution",
            statut=StatutReception.en_cours,
            saisie_aveugle=True,
        )
        rec2 = Reception(
            numero_en="EN2024-002",
            magasin_id=mag_pointe.id,
            code_fournisseur="FOUR002",
            fournisseur_nom="Carib Wholesale",
            statut=StatutReception.en_cours,
            saisie_aveugle=False,
        )
        db.add_all([rec1, rec2])
        await db.flush()

        # Lignes réception 1
        lignes_r1 = [
            LigneReception(reception_id=rec1.id, article_id=articles[0].id,
                           reference_interne="ART001", designation="Eau minérale 1,5L pack x6",
                           quantite_attendue=50),
            LigneReception(reception_id=rec1.id, article_id=articles[1].id,
                           reference_interne="ART002", designation="Jus de fruits tropical 1L",
                           quantite_attendue=30),
            LigneReception(reception_id=rec1.id, article_id=articles[2].id,
                           reference_interne="ART003", designation="Farine de blé 1kg",
                           quantite_attendue=20),
        ]
        # Lignes réception 2 (saisie informée)
        lignes_r2 = [
            LigneReception(reception_id=rec2.id, article_id=articles[3].id,
                           reference_interne="ART004", designation="Huile de tournesol 1L",
                           quantite_attendue=40),
            LigneReception(reception_id=rec2.id, article_id=articles[4].id,
                           reference_interne="ART005", designation="Riz blanc long grain 5kg",
                           quantite_attendue=15),
        ]
        db.add_all(lignes_r1 + lignes_r2)
        await db.flush()
        print(f"✓ Réception 1 : {rec1.numero_en} ({len(lignes_r1)} lignes) — saisie aveugle")
        print(f"✓ Réception 2 : {rec2.numero_en} ({len(lignes_r2)} lignes) — saisie informée")

        # ------------------------------------------------------------------ #
        # 6. Paramètres par défaut
        # ------------------------------------------------------------------ #
        default_params = [
            ("smtp_host", settings.SMTP_HOST or "smtp.example.com"),
            ("smtp_port", settings.SMTP_PORT),
            ("smtp_user", settings.SMTP_USER or "receptions@gcd.gp"),
            ("smtp_use_tls", True),
            ("mail_achats", settings.MAIL_ACHATS or "achats@gcd.gp"),
            ("ftp_host", settings.FTP_HOST or "ftp.gcd.gp"),
            ("ftp_use_sftp", True),
        ]
        for cle, valeur in default_params:
            db.add(Parametre(cle=cle, valeur=valeur))

        await db.commit()
        print("\n✅ Seed terminé avec succès !")
        print("\n--- Connexion admin ---")
        print("  URL: /auth/login")
        print("  Body: {\"username\": \"admin\", \"password\": \"Admin2024!\"}")
        print("\n--- Connexion magasinier ---")
        print("  URL: /auth/pin")
        print(f"  Body: {{\"magasin_code\": \"{mag_pointe.code}\", \"pin\": \"1234\"}}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
