# Groupe Caraïbes Distribution — Application Réception

PWA de validation des réceptions fournisseurs. Tablette (Android) en entrepôt.

## Architecture

```
reception/
├── backend/          FastAPI 0.11x + Python 3.12 + SQLAlchemy async
├── frontend/         React 18 + Vite + TypeScript (PWA)
├── docker-compose.yml
├── .env              Variables sensibles (jamais commitées)
└── deploy.sh         Script de déploiement VPS
```

### Stack
- **Backend** : FastAPI, SQLAlchemy async, Alembic, PostgreSQL 16, Loguru
- **Frontend** : React 18, Vite, TypeScript, Dexie.js (IndexedDB offline), React Router
- **PDF** : WeasyPrint + Jinja2 (template `backend/app/templates/rapport_ecart.html`)
- **Mail** : smtplib (SMTP/TLS)
- **FTP** : ftplib.FTP_TLS avec sous-classe `_FTPTLSResuming` pour FileZilla
- **Infra** : Docker Compose, Nginx Proxy Manager (réseau externe `proxy`)

## VPS et déploiement

```bash
# Déployer (depuis /opt/reception sur le VPS)
bash /opt/reception/deploy.sh

# Contenu de deploy.sh
git pull
docker-compose down
docker-compose build --no-cache backend frontend
docker-compose up -d
```

> **Important** : toujours faire `docker-compose down && up -d` pour recharger le `.env`.
> `docker restart <service>` NE relit PAS les variables d'environnement.

### Conteneurs
```
reception_backend_1    FastAPI  (port interne 8000)
reception_frontend_1   Nginx servant le build Vite
reception_db_1         PostgreSQL 16
```

### Logs
```bash
docker logs reception_backend_1 --tail 100 -f
docker logs reception_frontend_1 --tail 50
```

### Base de données
```bash
# Shell psql dans le conteneur
docker exec -it reception_db_1 psql -U reception -d reception_db

# Noms de tables (toujours singulier)
\dt
-- reception, ligne_reception, article, code_barre, magasin,
-- utilisateur, societe, import_log, parametre, photo_ligne,
-- reception_archive
```

## FTP (import automatique 6h00)

- Protocole : **FTPS** (FTP over TLS, port 21) — PAS SFTP
- Serveur : FileZilla Server → exige la reprise de session TLS sur le canal de données
- Solution : sous-classe `_FTPTLSResuming` dans `backend/app/services/import_ftp.py`
- Chaque opération (list, read, move) crée une **connexion fraîche** via `_make_ftp_client()`
  car le ticket TLS change après chaque transfert
- `nlst()` retourne des chemins complets (`/receptions/file.xlsx`) → utiliser `os.path.basename()`
- Articles inconnus dans les codes-barres → **auto-créés** en base

```bash
# Déclencher un import FTP manuellement
bash /opt/reception/ftp_reception.sh
bash /opt/reception/ftp_codebarre.sh
```

## Post-validation (PDF + mail)

Fichier : `backend/app/tasks/post_validation.py`

Flux après validation :
1. Endpoint `POST /receptions/{id}/valider` → commit BDD **avant** le background task
   (évite le deadlock de verrou de ligne)
2. `run_post_validation(reception_id)` → session fraîche `AsyncSessionLocal()`
3. Génère PDF avec WeasyPrint
4. Envoie mail (PDF en pièce jointe) au magasin + Cc achats
5. Passe statut → `envoye`

> **Bug connu résolu** : `CodeBarre.created_by` doit être chargé avec `selectinload()`
> sinon `MissingGreenlet` exception en async → mail jamais envoyé.

## Frontend — points critiques

### Service Worker / Cache PWA
Après chaque déploiement, il faut vider le cache navigateur sur la tablette :
**Menu navigateur → Paramètres → Vider les données du site** (pas juste F5).

### Douchette HID (Android)
Android désactive le clavier virtuel quand un appareil HID est connecté.
Fix : **Paramètres Android → Clavier physique → Afficher le clavier virtuel**.

### Modal quantité
- S'ouvre après **scan** (HID ou caméra) ET après **tap** sur une ligne
- Pavé numérique intégré → pas besoin du clavier virtuel
- `onTouchEnd` avec détection de scroll (> 8px) pour éviter l'ouverture lors du défilement

## Rôles utilisateurs

| Rôle | Droits |
|------|--------|
| `magasinier` | Saisie quantités sur ses réceptions |
| `responsable` | Saisie + toggle aveugle + validation + validation |
| `achats` | Lecture, imports |
| `admin` | Tout |

## Statuts réception

```
en_cours → prete → valide → envoye → archive
```

- `en_cours` : saisie en cours
- `prete` : magasinier a terminé, en attente responsable
- `valide` : responsable a validé (PDF généré)
- `envoye` : mail envoyé avec succès
- `archive` : archivé

## Mode saisie aveugle

Le **responsable** peut activer/désactiver le mode aveugle depuis :
- La page de saisie (`Saisie.tsx`) dès que statut = `en_cours` ou `prete`
- La page de validation (`Validation.tsx`)

Quand actif : les quantités attendues sont masquées au magasinier.

## Endpoints API clés

```
POST   /receptions/{id}/valider          Validation finale
POST   /receptions/{id}/terminer         Fin de saisie magasinier
PATCH  /receptions/{id}/saisie-aveugle   Toggle mode aveugle
PATCH  /receptions/{id}/lignes/{lid}     Mise à jour quantité
POST   /receptions/{id}/lignes           Ajout hors commande
POST   /api/import/run-all              Déclenche import FTP
GET    /receptions/{id}/pdf              Télécharge le PDF
```

## Commandes utiles

```bash
# Relancer post-validation manuellement (ex: mail non reçu)
docker exec -it reception_backend_1 python -c "
import asyncio
from app.tasks.post_validation import run_post_validation
asyncio.run(run_post_validation(<ID_RECEPTION>))
"

# Vérifier statuts réceptions en BDD
docker exec -it reception_db_1 psql -U reception -d reception_db \
  -c "SELECT id, numero_en, statut, valide_le, envoye_le FROM reception ORDER BY id DESC LIMIT 10;"

# Réinitialiser des réceptions (remettre en_cours + effacer quantités reçues)
# Colonnes exactes : statut, valide_le, envoye_le, valide_par_user_id
docker exec -it reception_db_1 psql -U reception -d reception_db
# Puis dans psql :
# UPDATE reception SET statut='en_cours', valide_le=NULL, envoye_le=NULL, valide_par_user_id=NULL WHERE id IN (...);
# UPDATE ligne_reception SET quantite_recue=NULL WHERE reception_id IN (...);

# Supprimer des réceptions (ordre obligatoire : photos → lignes → réceptions)
# DELETE FROM photo_ligne WHERE ligne_reception_id IN (SELECT id FROM ligne_reception WHERE reception_id IN (...));
# DELETE FROM ligne_reception WHERE reception_id IN (...);
# DELETE FROM reception WHERE id IN (...);

# Alembic migrations
docker exec -it reception_backend_1 alembic upgrade head
```

## Variables d'environnement (.env)

```env
# Base de données
POSTGRES_USER=reception
POSTGRES_PASSWORD=...
POSTGRES_DB=reception_db

# SMTP
SMTP_HOST=...
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USER=...
SMTP_PASSWORD=...
MAIL_ACHATS=...

# FTP (FTPS, PAS SFTP)
FTP_HOST=...
FTP_USER=...
FTP_PASSWORD=...
FTP_USE_SFTP=False        # Toujours False pour FileZilla
FTP_PORT=21
FTP_PATH_RECEPTIONS=/receptions
FTP_PATH_CODES_BARRES=/codes_barres
```

## Structure des fichiers importants

```
backend/app/
├── api/
│   ├── receptions.py      Endpoints réceptions (valider, terminer, lignes…)
│   └── deps.py            Auth, require_magasin_access
├── models/models.py       SQLAlchemy ORM (tables singulières)
├── services/
│   ├── import_ftp.py      Import FTPS avec _FTPTLSResuming
│   ├── mailer.py          Envoi SMTP (send_validation_mail, send_test_mail)
│   └── pdf_generator.py   WeasyPrint
├── tasks/
│   └── post_validation.py PDF + mail en background task
├── templates/
│   └── rapport_ecart.html Template Jinja2 WeasyPrint
└── core/
    ├── config.py          Settings (get_settings)
    └── database.py        AsyncSessionLocal, Base

frontend/src/
├── pages/
│   ├── Saisie.tsx         Page saisie magasinier (scan, tap, modal quantité)
│   ├── Receptions.tsx     Liste réceptions (filtres EN + fournisseur + statut)
│   └── Validation.tsx     Page validation responsable
├── api/receptions.ts      Client API TypeScript
├── db/database.ts         Dexie.js (IndexedDB offline)
└── store/authStore.ts     Zustand auth store
```

## Tests restants (pre-production)

- [ ] **A** — Mode hors ligne : couper WiFi → saisir → reconnecter → sync auto
- [ ] **C** — Photos : test upload depuis tablette
- [ ] **F** — Backup BDD : déclencher un backup manuel, vérifier le fichier
- [ ] **G** — FTP automatique 6h00 : vérifier que le scheduler APScheduler est actif
