# Cahier des charges — Application de validation des réceptions

> **Document destiné à Claude Code.** Lis l'intégralité avant de proposer une architecture, puis confirme le plan de découpage en sprints avant d'écrire du code.

---

## 1. Contexte et objectif

Groupe de distribution retail basé en Guadeloupe, opérant **7 sociétés × jusqu'à 5 magasins = ~20 sites** dans les Antilles-Guyane. Objectif : remplacer le contrôle papier des réceptions fournisseurs par une **PWA tablette** (Crosscall T4 / T5, Android) auto-hébergée via Docker Compose.

Le magasinier saisit les quantités reçues à l'aide d'une douchette code-barres (caméra en secours). Le responsable du site valide, génère un **PDF d'écarts signé** et envoie le rapport par mail au service achats.

**MVP attendu : 2 à 3 semaines de développement.**

---

## 2. Stack technique imposée

| Couche | Choix |
|---|---|
| Frontend | **PWA** (React + Vite + TypeScript), installable sur Android/iOS, support hors ligne complet |
| Stockage offline | **IndexedDB** (via Dexie.js) + **Service Worker** (Workbox) |
| Backend | **FastAPI** (Python 3.12) — cohérent avec l'écosystème existant du client (scripts Python) |
| Base de données | **PostgreSQL 16** |
| File de tâches | **APScheduler** intégré au backend (suffisant pour l'imports FTP quotidien) ou **Celery + Redis** si plus de robustesse souhaitée |
| Reverse proxy | **Caddy** (HTTPS auto, simple) ou Traefik |
| Conteneurisation | **Docker Compose** unique avec volumes pour DB, fichiers FTP, médias |
| Authentification | **JWT** + **code PIN** à 4-6 chiffres lié à l'utilisateur, rate-limit anti-brute-force |
| Génération PDF | **WeasyPrint** (HTML → PDF, gestion native du français) |
| Envoi mail | **smtplib** Python avec compte SMTP configurable depuis l'admin |
| Lecture Excel | **openpyxl** |
| Lecture FTP | **paramiko** (SFTP) ou **ftplib** selon le serveur |

---

## 3. Acteurs et rôles

| Rôle | Authentification | Permissions |
|---|---|---|
| **Magasinier** | PIN | Voit uniquement les réceptions de SON magasin, saisit les quantités reçues, peut sauvegarder en brouillon, peut modifier ses saisies tant que non validées par le responsable, peut ajouter une ligne pour un article non commandé, peut associer un nouveau code-barres à un article existant, peut joindre photos et commentaires |
| **Responsable site** | PIN | Mêmes droits que le magasinier sur son magasin + activation/désactivation de l'option "saisie à l'aveugle" par réception + modification des saisies du magasinier + validation finale (déclenche PDF + envoi mail) |
| **Service achats** | PIN ou login web | Consulte les écarts de tous les magasins, reçoit en copie tous les mails de validation, reçoit le tableau Excel des nouveaux codes-barres associés |
| **Admin** | Login + mot de passe (pas de PIN) | Configure SMTP, mails magasins, sociétés, magasins, utilisateurs, paramètres FTP, supervise les imports |

**Règle multi-tenant** : un utilisateur magasinier/responsable est rattaché à **un seul magasin**. Toutes les requêtes API filtrent automatiquement sur `magasin_id` côté serveur.

---

## 4. Modèle de données (PostgreSQL)

```
societe
  id, nom, code

magasin
  id, societe_id (FK), nom, code, mail_destinataire, actif

utilisateur
  id, magasin_id (FK, nullable pour admin/achats), nom, prenom,
  role (magasinier|responsable|achats|admin), pin_hash, password_hash (admin),
  actif, created_at

article
  id, reference_interne (UNIQUE), designation, created_at, updated_at

code_barre
  id, article_id (FK), code, source (import|ajout_terrain),
  created_at, created_by_user_id
  UNIQUE(code) -- un code-barres ne peut pointer que vers un article

reception
  id, numero_en (numéro Bon de réception), magasin_id (FK), code_fournisseur,
  fournisseur_nom, date_import, statut (en_cours|valide|envoye|archive),
  saisie_aveugle BOOL DEFAULT TRUE,
  cree_par_user_id, valide_par_user_id, valide_le, envoye_le,
  pdf_path, hash_fichier_source

ligne_reception
  id, reception_id (FK), article_id (FK, nullable si article inconnu),
  reference_interne, reference_fournisseur, designation,
  quantite_attendue, quantite_recue (nullable jusqu'à saisie),
  ajout_hors_commande BOOL DEFAULT FALSE,
  modifie_par_user_id, modifie_le, commentaire

photo_ligne
  id, ligne_reception_id (FK), chemin_fichier, commentaire, uploaded_at

import_log
  id, type (receptions|codes_barres), fichier_nom, statut, lignes_traitees,
  lignes_erreur, message_erreur, started_at, ended_at

parametre
  cle (PK), valeur (JSONB)
  -- ex: smtp_host, smtp_port, smtp_user, smtp_password, mail_achats,
  --     ftp_host, ftp_user, ftp_password, ftp_path_receptions, ftp_path_codes_barres
```

---

## 5. Imports automatisés (cron quotidien — 6h00)

### 5.1 Fichier `<N°EN>_<Magasin>_<CodeFournisseur>.xlsx` (réceptions)

**Colonnes attendues :**
- Société concernée
- Code fournisseur
- Fournisseur (nom)
- Référence interne
- Référence fournisseur
- Désignation article
- Quantité attendue

**Logique d'import :**
1. Lister tous les fichiers du dossier FTP `receptions/`.
2. Pour chaque fichier, parser le nom : `(numero_en)_(magasin_code)_(code_fournisseur).xlsx`.
3. Vérifier qu'il n'existe pas déjà une réception avec le même `numero_en` + `magasin_id`. Si oui, ignorer (les bordereaux ne sont pas mis à jour après envoi — règle C5).
4. Créer la `reception` (statut `en_cours`, `saisie_aveugle = TRUE` par défaut).
5. Pour chaque ligne du fichier, créer `ligne_reception`. Résoudre `article_id` via `reference_interne`. Si l'article n'existe pas en base, le créer avec sa désignation.
6. Déplacer le fichier traité dans `receptions/archive/AAAA-MM/`.
7. Logger dans `import_log`.

### 5.2 Fichier code-barres (remplacement complet quotidien)

**Colonnes attendues :** Référence interne, Code-barres (un article peut avoir plusieurs lignes)

**Logique d'import :**
1. Charger tout le fichier en mémoire.
2. **Stratégie de remplacement intelligente** : ne pas vider toute la table.
   - Pour chaque (référence interne, code-barres) du fichier : upsert avec `source='import'`.
   - Supprimer les codes-barres `source='import'` qui ne sont plus dans le fichier.
   - **Conserver intacts** les codes-barres `source='ajout_terrain'` (créés par les magasiniers).
3. Logger.

---

## 6. Parcours fonctionnel — Magasinier

### 6.1 Connexion
- Saisie PIN (clavier numérique grand format, adapté tablette).
- Affichage : nom magasin en bandeau permanent.

### 6.2 Liste des réceptions du jour
- Tri par numéro EN décroissant.
- Filtres : statut (en cours / validées), fournisseur.
- Badge visuel : nombre de lignes / lignes saisies.

### 6.3 Saisie d'une réception
- **Mode "saisie à l'aveugle" (défaut)** : la colonne quantité attendue est masquée. Le magasinier voit uniquement Réf interne, désignation, Référence fournisseur, quantité reçue à saisir. Possibilité d’ajout de quantité.
- **Mode "saisie informée"** (si responsable a désactivé l'aveugle) : quantité attendue affichée.
- **Saisie par scan douchette** : le scan d'un code-barres :
  - Cherche dans la liste des lignes ouvertes → focus sur la ligne et ouverture du clavier.
  - Si code inconnu : popup "Code-barres inconnu, à quel article l'associer ?" → recherche article (par réf, référence fournisseur ou désignation) → enregistre en `source='ajout_terrain'`.
  - Si code connu mais article hors bordereau : propose **ajout d'une ligne hors commande**.
- **Saisie manuelle** : champ recherche (référence, référence fournisseur ou désignation, recherche `LIKE` insensible accents/casse) pour articles sans code-barres.
- **Caméra de secours** : bouton "Scanner avec caméra" → lib **`@zxing/browser`** → traité comme un scan douchette.
- **Photos et commentaires** : icône appareil photo par ligne, commentaire libre.
- **Quantité 0 obligatoire** : pour valider, **chaque ligne doit avoir une quantité saisie** (0 inclus). Une ligne non saisie bloque la validation.
- **Sauvegarde brouillon** : bouton "Enregistrer" à tout moment, persiste localement (IndexedDB) ET serveur si online.
- **Modification** : tant que statut = `en_cours`, le magasinier peut revenir et corriger.

### 6.4 Soumission au responsable
- Bouton "Terminer la saisie" → vérifie que toutes les lignes sont saisies → marque la réception "prête à valider".

---

## 7. Parcours fonctionnel — Responsable

### 7.1 Avant la réception
- Pour chaque réception en attente, possibilité de **désactiver la saisie à l'aveugle** (toggle).

### 7.2 Validation
- Accès depuis tablette OU depuis PC bureau (interface responsive).
- Vue récapitulative avec colonnes : Réf, désignation, attendu, reçu, écart, photos, commentaire.
- Lignes en écart surlignées (rouge si manquant, orange si surplus, gris si conforme).
- Possibilité de **modifier les quantités** avant validation (champs éditables).
- Bouton "Valider et envoyer" → confirmation modale → génération PDF + envoi mail.

### 7.3 Après validation
- Statut passe à `valide` puis `envoye`.
- Aucune modification possible (lecture seule).

---

## 8. Génération PDF (rapport d'écart)

**Layout (WeasyPrint, template HTML/CSS) :**
- En-tête : logo société, nom magasin, fournisseur, n° EN, date.
- Tableau articles : Réf interne, Réf fournisseur, Désignation, Qté attendue, Qté reçue, Écart, Commentaire.
- Lignes "ajout hors commande" : badge visuel "HORS COMMANDE".
- Section photos : miniatures avec légendes.
- Pied : récap (nombre lignes conformes / écarts / hors commande), ligne signature avec nom du responsable validateur, date/heure de validation, mention "Document généré électroniquement".
- **Hash SHA-256 du PDF** stocké en base pour traçabilité.

---

## 9. Envoi des mails (déclenché à la validation)

**Mail ZEENDOC = configurable par magasin : **
- De : `<smtp_user_admin>` (ex : `receptions@groupe.com`)
- À : mail destinataire
- Cc : **mail service achats systématique**
- Objet : `[<Magasin>] Réception EN <numero> – <fournisseur> – <date>`
- Corps : message standardisé français, mention écarts éventuels.
- Pièce jointe : PDF signé.

**Mail secondaire — récap nouveaux codes-barres (envoyé à chaque validation s'il y a eu des ajouts terrain) :**
- À : service achats uniquement.
- Objet : `Nouveaux codes-barres associés – <Magasin> – <date>`
- Pièce jointe : **`nouveaux_codes_barres_<magasin>_<date>.xlsx`** avec colonnes Réf interne, , référence fournisseur, Désignation, Code-barres ajouté, Date, Saisi par.

---

## 10. Mode hors ligne

- **Service Worker** met en cache l'app shell (HTML/CSS/JS).
- **IndexedDB** stocke :
  - Toutes les réceptions du magasin du jour (téléchargées au login si online).
  - Toutes les saisies en cours.
  - Photos en attente d'upload (compressées avant stockage, max 1 Mo chacune).
- **Sync** : à chaque retour online, push automatique des saisies vers l'API. Indicateur visuel d'état (synchronisé / en attente).
- **Conflit** : règle simple — si le bordereau a été modifié serveur entre-temps (cas exceptionnel), **la version tablette gagne** (cf. C5).
- **Validation responsable hors ligne** : autorisée. Le PDF + mail partent à la prochaine connexion.

---

## 11. Endpoints API (FastAPI)

```
POST   /auth/pin                    -> {magasin_code, pin} -> JWT
POST   /auth/login                  -> {username, password} -> JWT (admin uniquement)
POST   /auth/logout

GET    /receptions                  -> liste filtrée par magasin de l'utilisateur
GET    /receptions/{id}             -> détail + lignes
PATCH  /receptions/{id}/saisie-aveugle  -> {actif: bool} (responsable)
PATCH  /receptions/{id}/lignes/{ligne_id}  -> {quantite_recue, commentaire}
POST   /receptions/{id}/lignes      -> ajout ligne hors commande
POST   /receptions/{id}/lignes/{ligne_id}/photos  -> upload photo
POST   /receptions/{id}/terminer    -> magasinier marque "prête à valider"
POST   /receptions/{id}/valider     -> responsable valide -> PDF + mail
GET    /receptions/{id}/pdf         -> téléchargement PDF généré

GET    /articles/recherche?q=...    -> recherche par réf/désignation
GET    /articles/par-code-barre/{code}  -> résolution code-barres
POST   /codes-barres                -> ajout terrain (article_id, code)

POST   /sync/push                   -> envoi en masse des saisies offline
GET    /sync/pull                   -> récupération des réceptions du jour

# Admin
GET/POST/PATCH/DELETE  /admin/societes
GET/POST/PATCH/DELETE  /admin/magasins
GET/POST/PATCH/DELETE  /admin/utilisateurs
GET/PATCH              /admin/parametres   (SMTP, FTP, mail achats)
POST                   /admin/imports/declencher  (force un import manuel)
GET                    /admin/imports/logs
```

---

## 12. Sécurité

- HTTPS obligatoire (Caddy gère Let's Encrypt si exposé, sinon certificat auto-signé en LAN).
- PIN : hash **bcrypt**, lockout 5 essais / 10 minutes.
- JWT : durée 12h, refresh token 7 jours.
- CORS strict : origin = domaine de l'app uniquement.
- Validation Pydantic stricte sur toutes les entrées.
- Rate limiting sur `/auth/*` (slowapi).
- Logs structurés (loguru).

---

## 13. Conservation des données

- Réceptions consultables jusqu'à **fin du mois suivant** la réception.
- Tâche planifiée mensuelle : archivage des réceptions plus anciennes en table `reception_archive` + suppression des photos disque.
- PDF conservés 12 mois pour traçabilité légale.

---

## 14. Configuration Docker Compose

```yaml
services:
  db:           # postgres:16
  backend:      # FastAPI + APScheduler (imports + archivage)
  frontend:     # Build PWA servi statiquement
  caddy:        # reverse proxy HTTPS
volumes:
  pgdata:
  ftp_archive:
  pdf_storage:
  photo_storage:
```

Variables d'environnement via `.env` :
- `DATABASE_URL`, `JWT_SECRET`, `FTP_HOST`, `FTP_USER`, `FTP_PASSWORD`,
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_ACHATS`,
- `DOMAIN_NAME`.

---

## 15. Plan de développement (3 sprints d'une semaine)

### Sprint 1 — Fondations
- Setup repo (monorepo : `/backend`, `/frontend`, `/docker`).
- Docker Compose fonctionnel (DB + backend + frontend).
- Modèle SQLAlchemy + migrations Alembic.
- Auth PIN + admin.
- CRUD admin (sociétés, magasins, utilisateurs, paramètres).
- Import FTP fichier réceptions + fichier codes-barres + tests sur fichiers d'exemple.

### Sprint 2 — Saisie magasinier (cœur métier)
- PWA shell + Service Worker + IndexedDB (Dexie).
- Écran login PIN.
- Liste réceptions + détail.
- Saisie : scan douchette (focus input), caméra (zxing), recherche article, ajout hors commande, photos, commentaires.
- Mode hors ligne complet + sync.
- Mode "saisie à l'aveugle" + désactivation responsable.

### Sprint 3 — Validation, PDF, mails, polish
- Vue responsable (modification, validation).
- Génération PDF WeasyPrint (template + signature électronique).
- Envoi mails (fournisseur + Cc achats + tableau nouveaux codes-barres).
- Tâche d'archivage mensuelle.
- Tests E2E (Playwright) sur 3 scénarios clés : saisie online, saisie offline+sync, validation responsable.
- Documentation utilisateur (PDF court, captures d'écran).
- Documentation admin (déploiement, sauvegarde DB, configuration SMTP/FTP).

---

## 16. Critères d'acceptation MVP

- [ ] Un fichier déposé sur le FTP à 6h apparaît dans l'app à 6h05.
- [ ] Un magasinier peut, en mode avion, saisir une réception complète avec photos, puis sync au retour Wi-Fi.
- [ ] Un responsable peut désactiver la saisie aveugle, modifier une quantité, et valider → PDF généré, mails envoyés (achats), nouveaux codes-barres en pièce jointe Excel.
- [ ] Un scan de code-barres inconnu permet l'association à un article existant et le code est ensuite reconnu pour les prochaines réceptions.
- [ ] Un magasinier ne voit jamais les réceptions d'un autre magasin (test sécurité).
- [ ] L'app s'installe sur Crosscall T4 et T5 comme PWA depuis Chrome.

---

## 17. Consignes pour Claude Code

1. **Avant de coder**, propose-moi l'arborescence du repo et confirme la stack.
2. Travaille **sprint par sprint**, livre du code testable à chaque fin de sprint.
3. Écris les **tests unitaires** des règles métier critiques (résolution code-barres, calcul des écarts, blocage validation si saisie incomplète, isolation multi-tenant).
4. Fournis un `README.md` de déploiement clair : `docker compose up -d` doit suffire après remplissage du `.env`.
5. Inclus un **script de seed** avec 1 société, 2 magasins, 3 utilisateurs (1 magasinier, 1 responsable, 1 achats), 1 admin, et 2 réceptions d'exemple pour démo.
6. Toutes les chaînes UI sont en **français**. Les noms de variables/fonctions/commits restent en anglais.
7. Pour chaque feature : commit atomique avec message conventionnel (`feat:`, `fix:`, `chore:`).
8. Si une décision technique impacte le délai ou la simplicité, **demande avant** d'implémenter.
