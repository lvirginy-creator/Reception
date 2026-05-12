# Guide administrateur — Application Réception

## Prérequis

- Serveur Linux (Ubuntu 22.04 LTS recommandé) avec **Docker ≥ 24** et **Docker Compose v2**
- **Portainer** déjà installé et accessible sur le serveur
- **Nginx Proxy Manager (NPM)** déjà installé et fonctionnel sur le serveur
- Nom de domaine pointant sur le serveur (ex. : `reception.mon-groupe.com`)
- Accès SMTP sortant (port 587 ou 465)
- Accès FTP/SFTP au serveur de l'ERP (import des EN)

---

## 1. Déploiement via Portainer

### 1.1 Préparer le fichier d'environnement

Sur le serveur, créez le dossier et le fichier de configuration :

```bash
mkdir -p /opt/reception
git clone <url-du-depot> /opt/reception
cd /opt/reception
cp .env.example .env
nano .env
```

Variables obligatoires à renseigner dans `.env` :

| Variable | Description | Exemple |
|---|---|---|
| `POSTGRES_PASSWORD` | Mot de passe base de données | `ChangeMe!2024` |
| `JWT_SECRET` | Clé secrète JWT (min. 32 chars) | `openssl rand -hex 32` |
| `DOMAIN_NAME` | Domaine public de l'application | `reception.mon-groupe.com` |
| `FTP_HOST` | Adresse du serveur FTP ERP | `ftp.erp.interne` |
| `FTP_USER` | Identifiant FTP | `reception` |
| `FTP_PASSWORD` | Mot de passe FTP | `secret` |
| `FTP_PATH_RECEPTIONS` | Répertoire des fichiers EN | `/exports/receptions/` |
| `SMTP_HOST` | Serveur SMTP | `smtp.gmail.com` |
| `SMTP_PORT` | Port SMTP | `587` |
| `SMTP_USER` | Identifiant SMTP | `noreply@mon-groupe.com` |
| `SMTP_PASSWORD` | Mot de passe SMTP | `app-password` |
| `MAIL_ACHATS` | E-mail du service achats (Cc) | `achats@mon-groupe.com` |

> **Générer un JWT_SECRET sécurisé** : dans un terminal sur le serveur :
> ```bash
> openssl rand -hex 32
> ```
> Copiez le résultat dans le `.env`.

---

### 1.2 Déployer le Stack dans Portainer

1. Connectez-vous à **Portainer** (ex. : `https://portainer.mon-groupe.com`).
2. Dans le menu de gauche, allez dans **Stacks** → **+ Add stack**.
3. Donnez un nom au stack : `reception`.
4. Choisissez la méthode **Repository** (si le dépôt Git est accessible depuis le serveur) **ou** **Upload** (déposez le `docker-compose.yml` directement).

   **Alternative — méthode Web editor** :
   - Copiez-collez le contenu du fichier `docker-compose.yml` dans l'éditeur.

5. Dans la section **Environment variables**, cliquez sur **Load variables from .env file** et sélectionnez votre fichier `.env`, ou saisissez les variables une par une.
6. Cliquez sur **Deploy the stack**.

Portainer construit les images et démarre les 3 conteneurs (`db`, `backend`, `frontend`).

---

### 1.3 Initialiser la base de données

Dans Portainer, allez dans **Containers** → cliquez sur le conteneur `reception_backend_1` → onglet **Console** → **Connect** (shell `bash`).

Exécutez :

```bash
# Appliquer les migrations Alembic
alembic upgrade head

# Créer les données de base (magasins, utilisateurs de démo)
python seed.py
```

> **En production**, modifiez les PINs et mots de passe dans `seed.py` avant de l'exécuter, ou créez les utilisateurs directement depuis l'interface `/admin` après le premier démarrage.

---

## 2. Configuration du reverse proxy (Nginx Proxy Manager)

NPM se charge du HTTPS et redirige le trafic vers les conteneurs. Une seule entrée DNS → deux règles de proxy dans NPM.

### 2.1 Architecture

```
Internet
   │
   ▼
NPM (port 443 HTTPS)
   ├── /api/*  →  127.0.0.1:8000  (backend FastAPI)
   └── /*      →  127.0.0.1:3000  (frontend Nginx)
```

> Les ports `8000` et `3000` sont exposés **uniquement sur `127.0.0.1`** (loopback) dans le `docker-compose.yml`, ils ne sont donc pas accessibles depuis l'extérieur sans passer par NPM.

### 2.2 Créer le Proxy Host dans NPM

1. Connectez-vous à **Nginx Proxy Manager** (ex. : `https://npm.mon-groupe.com`).
2. Allez dans **Proxy Hosts** → **Add Proxy Host**.

**Onglet Details :**

| Champ | Valeur |
|---|---|
| Domain Names | `reception.mon-groupe.com` |
| Scheme | `http` |
| Forward Hostname / IP | `127.0.0.1` |
| Forward Port | `3000` |
| Cache Assets | ✅ activé |
| Block Common Exploits | ✅ activé |

**Onglet SSL :**

| Champ | Valeur |
|---|---|
| SSL Certificate | Request a new SSL Certificate (Let's Encrypt) |
| Force SSL | ✅ activé |
| HTTP/2 Support | ✅ activé |
| E-mail | votre adresse admin |

Cliquez **Save**. Le certificat Let's Encrypt est généré automatiquement.

### 2.3 Ajouter la règle de routage `/api`

NPM doit rediriger `/api/*` vers le backend (port 8000) et tout le reste vers le frontend (port 3000).

1. Ouvrez le Proxy Host `reception.mon-groupe.com` → **Edit**.
2. Allez dans l'onglet **Advanced**.
3. Dans le champ **Custom Nginx Configuration**, collez :

```nginx
# Proxy /api/* vers le backend FastAPI
location /api/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}

# Proxy /storage/* vers le backend (photos, PDFs)
location /storage/ {
    proxy_pass http://127.0.0.1:8000/storage/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

4. Cliquez **Save**.

> **Test de vérification** :
> ```bash
> curl https://reception.mon-groupe.com/api/health
> # Réponse attendue : {"status":"ok"}
> ```

---

## 3. Interface d'administration de l'application

Accédez à `https://reception.mon-groupe.com/admin` en étant connecté en tant qu'`admin`.

### 3.1 Sociétés

Créez une société par entité juridique du groupe. Chaque société regroupe plusieurs magasins.

### 3.2 Magasins

Pour chaque magasin :
- **Code** : 3 lettres uniques (ex. : `PAP`) — doit correspondre au code dans les fichiers FTP
- **E-mail** : adresse destinataire du rapport PDF (peut être différente de l'adresse SMTP)

### 3.3 Utilisateurs

Rôles disponibles :

| Rôle | Droits |
|---|---|
| **Magasinier** | Saisit les quantités de sa réception |
| **Responsable** | Valide et envoie les réceptions de son magasin |
| **Achats** | Lecture seule des réceptions (futur) |
| **Admin** | Accès complet à l'interface d'administration |

- Les magasiniers et responsables s'authentifient par **PIN** (4-6 chiffres).
- Les admins s'authentifient par **login + mot de passe**.
- Utilisez **Désactiver** pour bloquer un compte sans le supprimer.
- Utilisez **PIN** pour réinitialiser le code PIN d'un utilisateur.

---

## 4. Import FTP (fichiers EN)

### 4.1 Format attendu

L'ERP doit déposer des fichiers Excel `.xlsx` dans le répertoire FTP configuré. Convention de nommage :

```
<NUMERO_EN>_<CODE_MAGASIN>_<FOURNISSEUR>.xlsx
```

Exemple : `EN2024-001_PAP_SOCIETE-GENERALE-ALIMENTAIRE.xlsx`

Le fichier doit contenir une feuille avec les colonnes :
- `REF` : référence article
- `DESIGNATION` : libellé article
- `CODE_BARRE` : code EAN (optionnel)
- `QTE_ATTENDUE` : quantité commandée

### 4.2 Planification automatique

L'import se déclenche **tous les jours à 6h00 heure Guadeloupe** (America/Guadeloupe).

**Déclencher un import manuellement via Portainer :**

1. Dans Portainer → **Containers** → `reception_backend_1`.
2. Onglet **Console** → **Connect**.
3. Exécutez :
```bash
python -c "
import asyncio
from app.services.import_ftp import run_all_imports
asyncio.run(run_all_imports())
"
```

### 4.3 Archivage

Les fichiers importés sont déplacés dans `/ftp_archive/` après traitement. Consultez les logs du conteneur backend dans Portainer pour vérifier les imports.

### 4.4 Codes-barres terrain

Les codes-barres ajoutés manuellement par les magasiniers (source `ajout_terrain`) ne sont **jamais supprimés** par l'import FTP. Seuls les codes-barres importés depuis l'ERP peuvent être mis à jour.

---

## 5. Configuration SMTP

### Gmail / Google Workspace

1. Activez la validation en 2 étapes sur le compte Google.
2. Générez un **mot de passe d'application** (Sécurité → Mots de passe des applications).
3. Dans `.env` (ou variables d'environnement du stack Portainer) :
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=noreply@votre-domaine.com
   SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
   ```

### OVH Mail Pro

```
SMTP_HOST=pro3.mail.ovh.net
SMTP_PORT=587
SMTP_USER=noreply@votre-domaine.com
SMTP_PASSWORD=votre-mot-de-passe
```

### Test d'envoi via Portainer

Dans Portainer → console du conteneur `backend` :

```bash
python -c "
from app.services.mailer import send_test_mail
import asyncio
asyncio.run(send_test_mail('votre@email.com'))
"
```

---

## 6. Sauvegarde

### 6.1 Base de données PostgreSQL

**Via Portainer — console du conteneur `db`** :

```bash
pg_dump -U reception reception | gzip > /tmp/reception-$(date +%Y%m%d).sql.gz
```

Puis récupérez le fichier via l'explorateur de volumes Portainer (**Volumes** → `reception_pgdata`).

**Automatisation sur le serveur (cron) :**

```bash
# Éditer le crontab du serveur hôte
crontab -e

# Ajouter (sauvegarde chaque nuit à 2h)
0 2 * * * docker exec reception_db_1 pg_dump -U reception reception | gzip > /backup/reception-$(date +\%Y\%m\%d).sql.gz
```

> Adaptez `reception_db_1` au nom réel du conteneur affiché dans Portainer.

### 6.2 Fichiers PDF et photos

Les PDFs et photos sont dans les volumes Docker visibles dans Portainer (**Volumes**) :
- `reception_pdf_storage` — rapports de réception (conserver 12 mois minimum)
- `reception_photo_storage` — photos des livraisons

**Sauvegarde depuis le serveur hôte :**

```bash
docker run --rm \
  -v reception_pdf_storage:/data \
  -v /backup:/backup \
  alpine tar czf /backup/pdf-$(date +%Y%m%d).tar.gz /data

docker run --rm \
  -v reception_photo_storage:/data \
  -v /backup:/backup \
  alpine tar czf /backup/photos-$(date +%Y%m%d).tar.gz /data
```

### 6.3 Restauration

```bash
# Restaurer la base
gunzip -c /backup/reception-20240101.sql.gz | docker exec -i reception_db_1 psql -U reception reception

# Restaurer les volumes
docker run --rm \
  -v reception_pdf_storage:/data \
  -v /backup:/backup \
  alpine tar xzf /backup/pdf-20240101.tar.gz -C /
```

---

## 7. Monitoring et logs

### Consulter les logs dans Portainer

1. Allez dans **Containers**.
2. Cliquez sur le conteneur voulu (`backend`, `frontend`, `db`).
3. Onglet **Logs** — vous pouvez filtrer, télécharger ou activer le suivi en temps réel.

### Vérifier la santé depuis Portainer

- Les conteneurs avec un healthcheck affichent un badge **healthy** / **unhealthy** dans la liste.
- En cas de badge rouge, consultez les logs immédiatement.

### Vérifier depuis le navigateur

```
https://reception.mon-groupe.com/api/health
→ {"status":"ok"}
```

### Archivage automatique

Le 1er de chaque mois à 3h00, les réceptions de plus de 90 jours sont archivées (statut `archive`). Les données restent consultables mais n'apparaissent plus dans la liste principale.

---

## 8. Mise à jour de l'application

### Via Portainer (méthode recommandée)

1. Sur le serveur, mettez à jour le code :
   ```bash
   cd /opt/reception
   git pull origin main
   ```

2. Dans Portainer → **Stacks** → `reception` → **Editor**.
3. Si le `docker-compose.yml` a changé, collez la nouvelle version.
4. Cliquez sur **Update the stack** → Portainer reconstruit les images modifiées et redémarre les conteneurs.

5. Si la base de données a évolué, appliquez les migrations via la console du conteneur `backend` :
   ```bash
   alembic upgrade head
   ```

> Vérifiez toujours les notes de version avant une mise à jour pour identifier les migrations de base.

---

## 9. Sécurité

- L'accès admin (`/admin`) est réservé aux comptes de rôle `admin`. Ne partagez pas ce compte.
- Les tokens JWT expirent après **12h** (accès) et **7 jours** (refresh). Déconnectez-vous en fin de journée.
- Le PIN est haché avec **bcrypt** : il n'est pas récupérable, seulement réinitialisable depuis l'interface admin.
- Le **HTTPS est géré par NPM** (Nginx Proxy Manager) avec renouvellement automatique Let's Encrypt.
- Les ports applicatifs (`8000`, `3000`) sont exposés **uniquement en loopback** (`127.0.0.1`) — inaccessibles directement depuis Internet.
- En cas de suspicion d'intrusion, révoquez tous les tokens en changeant `JWT_SECRET` dans les variables d'environnement du stack Portainer et redémarrez le backend.

---

## 10. Dépannage courant

| Symptôme | Cause probable | Action |
|---|---|---|
| Import FTP échoue | Identifiants FTP incorrects ou serveur inaccessible | Vérifiez `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD` dans les variables du stack Portainer |
| E-mails non reçus | Authentification SMTP incorrecte | Vérifiez `SMTP_*` et testez avec `send_test_mail` via console Portainer |
| Certificat HTTPS expiré | NPM ne peut pas joindre Let's Encrypt | Vérifiez que les ports 80 et 443 sont ouverts dans le firewall et que NPM est sain |
| Backend ne démarre pas | Migration manquante | Ouvrez la console Portainer du backend → `alembic upgrade head` |
| Tablette ne se connecte pas | CORS ou URL incorrecte | Vérifiez `DOMAIN_NAME` et `CORS_ORIGINS` dans les variables du stack |
| Erreur 502 Bad Gateway sur NPM | Conteneur backend/frontend arrêté | Vérifiez l'état des conteneurs dans Portainer → relancez si nécessaire |
| Disque plein | Photos ou PDFs accumulés | Purgez les volumes via Portainer ou augmentez le disque |
| Conteneur en état `unhealthy` | Crash applicatif ou DB inaccessible | Consultez les logs dans Portainer pour identifier l'erreur |
