# Application de validation des réceptions

PWA tablette pour le contrôle des réceptions fournisseurs — Groupe Caraïbes Distribution.

---

## Démarrage rapide

### 1. Prérequis

- Docker Desktop ≥ 24 et Docker Compose v2
- Un terminal (PowerShell, bash, etc.)

### 2. Configuration

```bash
cp .env.example .env
```

Ouvrir `.env` et renseigner **au minimum** :

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL (choisir un mot de passe fort) |
| `JWT_SECRET` | Clé secrète JWT — générer avec `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DOMAIN_NAME` | Nom de domaine ou IP du serveur (ex: `reception.mongroupe.com`) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | Serveur mail pour l'envoi des rapports |
| `FTP_HOST` / `FTP_USER` / `FTP_PASSWORD` | Serveur FTP/SFTP source des fichiers Excel |
| `MAIL_ACHATS` | Adresse mail du service achats (copie systématique) |

### 3. Lancement

```bash
docker compose up -d
```

L'application est disponible sur `https://<DOMAIN_NAME>`.

### 4. Données de démonstration (optionnel)

```bash
docker compose exec backend python seed.py
```

Crée : 1 société, 2 magasins, 4 utilisateurs, 5 articles, 2 réceptions d'exemple.

Comptes demo créés :
- Admin : `POST /auth/login` → `{"username":"admin","password":"Admin2024!"}`
- Magasinier (magasin PAP, PIN 1234) : `POST /auth/pin` → `{"magasin_code":"PAP","pin":"1234"}`
- Responsable (magasin PAP, PIN 5678)
- Achats (PIN 9999)

### 5. Migrations base de données

```bash
# Appliquer les migrations (fait automatiquement au démarrage si besoin)
docker compose exec backend alembic upgrade head

# Créer une nouvelle migration après modification des modèles
docker compose exec backend alembic revision --autogenerate -m "description"
```

---

## Architecture

```
reception-app/
├── backend/        FastAPI + Python 3.12
├── frontend/       React 18 + Vite + TypeScript (PWA)
├── docker/         Caddyfile (reverse proxy HTTPS)
└── docker-compose.yml
```

### Services Docker

| Service | Description | Port interne |
|---|---|---|
| `db` | PostgreSQL 16 | 5432 |
| `backend` | FastAPI + APScheduler | 8000 |
| `frontend` | PWA (nginx) | 80 |
| `caddy` | Reverse proxy HTTPS | 80, 443 |

---

## Import FTP automatique

L'import s'exécute **chaque jour à 6h00** (heure Guadeloupe, America/Guadeloupe).

**Format attendu des fichiers réceptions** :
- Nom : `<N°EN>_<CodeMagasin>_<CodeFournisseur>.xlsx`
- Exemple : `EN2024-001_PAP_FOUR001.xlsx`
- Colonnes (ligne 2 et suivantes) : Société, Code fournisseur, Fournisseur, Réf interne, Réf fournisseur, Désignation, Quantité attendue

**Format attendu du fichier codes-barres** :
- Fichier `.xlsx` unique dans le dossier `FTP_PATH_CODES_BARRES`
- Colonnes : Référence interne, Code-barres

Pour forcer un import manuel :
```bash
# Via l'API admin (token admin requis)
curl -X POST https://<DOMAIN>/api/admin/imports/declencher \
  -H "Authorization: Bearer <token>"
```

---

## Tests

```bash
# Depuis le dossier backend/
pip install -e ".[dev]"
pytest -v

# Tests ciblés
pytest tests/test_security.py -v      # lockout PIN, JWT
pytest tests/test_multitenant.py -v   # isolation magasins
pytest tests/test_receptions.py -v    # règles métier
pytest tests/test_import.py -v        # upsert codes-barres
```

---

## Sauvegarde

### Base de données

```bash
# Dump quotidien recommandé
docker compose exec db pg_dump -U reception reception_db | gzip > backup_$(date +%Y%m%d).sql.gz

# Restauration
gunzip -c backup_20240101.sql.gz | docker compose exec -T db psql -U reception reception_db
```

### Fichiers (PDF, photos)

Les volumes Docker `pdf_storage` et `photo_storage` doivent être sauvegardés régulièrement.
Les PDF sont conservés 12 mois ; les photos sont supprimées lors de l'archivage mensuel.

---

## Gestion des utilisateurs

Depuis l'interface admin (`/admin`) ou via l'API :

```bash
# Créer un magasinier (PIN obligatoire)
POST /admin/utilisateurs
{
  "nom": "Dupont", "prenom": "Jean",
  "role": "magasinier",
  "magasin_id": 1,
  "pin": "4321"
}

# Créer un responsable
POST /admin/utilisateurs
{
  "nom": "Martin", "prenom": "Sophie",
  "role": "responsable",
  "magasin_id": 1,
  "pin": "8765"
}
```

---

## Installation PWA sur tablette (Android / Crosscall T4/T5)

1. Ouvrir Chrome sur la tablette.
2. Naviguer vers `https://<DOMAIN_NAME>`.
3. Menu ⋮ → **Ajouter à l'écran d'accueil**.
4. L'app s'installe comme une application native.

L'application fonctionne **hors ligne** : les réceptions du jour sont mises en cache au login.

---

## Surveillance

```bash
# Logs en temps réel
docker compose logs -f backend

# Vérifier les imports
docker compose exec backend python -c "
import asyncio
from app.core.database import AsyncSessionLocal
from app.models.models import ImportLog
from sqlalchemy import select

async def check():
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(ImportLog).order_by(ImportLog.started_at.desc()).limit(5))
        for log in r.scalars():
            print(f'{log.started_at} | {log.type} | {log.statut} | {log.lignes_traitees} lignes')
asyncio.run(check())
"
```

---

## Roadmap

- **Sprint 1** ✅ Fondations : Docker, DB, auth PIN, CRUD admin, import FTP
- **Sprint 2** ✅ Saisie magasinier : liste réceptions, saisie, scan douchette/caméra, mode hors ligne, vue responsable
- **Sprint 3** 📋 Tests E2E Playwright, documentation utilisateur/admin, polish tablette
