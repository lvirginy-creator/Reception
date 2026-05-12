# Critères d'acceptation MVP — Vérification

_Document de traçabilité : chaque critère du §16 du cahier des charges est mis en regard du code livré._

---

## Critère 1 — Import FTP → visible dans l'app à 6h05

**Énoncé** : Un fichier déposé sur le FTP à 6h apparaît dans l'app à 6h05.

| Composant | Fichier | Implémentation |
|---|---|---|
| Scheduler APScheduler | `backend/app/tasks/scheduler.py` | Tâche cron `run_all_imports` planifiée à **6h00 heure Guadeloupe** (`timezone="America/Guadeloupe"`), `misfire_grace_time=3600` |
| Import SFTP/FTP | `backend/app/services/import_ftp.py` | Connexion paramiko, lecture `.xlsx` openpyxl, création réceptions + lignes, archivage fichier |
| Import codes-barres | `backend/app/services/import_ftp.py` | Upsert codes-barres source='import', préservation codes ajout_terrain |
| Test | `backend/tests/test_import.py` | Vérifie création codes, préservation ajout_terrain, suppression codes import obsolètes |

**Délai estimé** : import typique < 30s pour ~500 lignes → visible à 6h01 au plus tard.

**Statut : ✅ Implémenté**

---

## Critère 2 — Saisie en mode avion + sync Wi-Fi

**Énoncé** : Un magasinier peut, en mode avion, saisir une réception complète avec photos, puis sync au retour Wi-Fi.

| Composant | Fichier | Implémentation |
|---|---|---|
| Détection réseau | `frontend/src/hooks/useOnlineStatus.ts` | Écoute `window.online/offline` |
| Stockage offline | `frontend/src/db/database.ts` | Dexie "ReceptionDB" : stores `receptions`, `pending_updates`, `pending_photos` |
| Sauvegarde offline | `frontend/src/pages/Saisie.tsx` | `saveLigne()` : PATCH API si online, sinon `db.pending_updates.add()` |
| Sync automatique | `frontend/src/hooks/useSync.ts` | Sur événement `online` : push pending_updates groupés par reception_id, pull pour rafraîchir |
| Indicateur | `frontend/src/components/SyncIndicator.tsx` | Affiche ● Synchronisé / ↑ Sync / ⚠ Hors ligne (N) |
| Photos offline | `frontend/src/db/database.ts` | Store `pending_photos` pour upload différé |
| Test E2E | `e2e/tests/02-saisie-offline-sync.spec.ts` | `context.setOffline(true)` → saisie → vérif IndexedDB → `setOffline(false)` → sync |

**Statut : ✅ Implémenté**

---

## Critère 3 — Validation responsable : saisie aveugle + PDF + mails

**Énoncé** : Un responsable peut désactiver la saisie aveugle, modifier une quantité, valider → PDF généré, mails envoyés (achats), nouveaux codes-barres en pièce jointe Excel.

| Composant | Fichier | Implémentation |
|---|---|---|
| Page de validation | `frontend/src/pages/Validation.tsx` | Toggle saisie aveugle, tableau éditable, bouton "Valider et envoyer" + modal confirmation |
| Endpoint valider | `backend/app/api/receptions.py` | `POST /receptions/{id}/valider` — garde rôle responsable/admin, `background_tasks.add_task(run_post_validation, ...)` |
| Génération PDF | `backend/app/services/pdf_generator.py` | WeasyPrint + template Jinja2 HTML, calcul conformes/écarts/hors_commande |
| Template PDF | `backend/templates/rapport_ecart.html` | Tableau coloré, stats, photos, zone signature, mention SHA-256 |
| Envoi mail | `backend/app/services/mailer.py` | Mail principal (PDF), mail secondaire codes-barres (Excel openpyxl) |
| Tâche background | `backend/app/tasks/post_validation.py` | Session AsyncSession fraîche, PDF → mail → statut envoye |
| Test E2E | `e2e/tests/03-validation-responsable.spec.ts` | Login responsable → Valider → modal → confirmation → statut changé |

**Statut : ✅ Implémenté**

---

## Critère 4 — Scan code-barres inconnu → association → reconnu ensuite

**Énoncé** : Un scan de code-barres inconnu permet l'association à un article existant, et le code est ensuite reconnu pour les prochaines réceptions.

| Composant | Fichier | Implémentation |
|---|---|---|
| Scanner HID | `frontend/src/components/BarcodeScanner.tsx` | Buffer global `keydown` < 150ms, déclenche sur Enter ≥ 3 chars, ignore input/textarea sauf `data-barcode` |
| Scanner caméra | `frontend/src/components/BarcodeScanner.tsx` | `BrowserMultiFormatReader` @zxing, préfère caméra arrière |
| Résolution barcode | `frontend/src/pages/Saisie.tsx` | `handleScan()` : GET /articles/barcode → ligne trouvée → focus ; sinon modal |
| Modal recherche | `frontend/src/components/ArticleSearchModal.tsx` | Recherche debounce 300ms ; si `unknownBarcode` : `articlesApi.associateBarcode()` avant `onSelect` |
| Endpoint association | `backend/app/api/articles.py` | `POST /articles/{id}/barcodes` : crée CodeBarre source='ajout_terrain', 409 si déjà pris |
| Persistance | `backend/app/models/models.py` | CodeBarre.source distingue import/ajout_terrain ; import FTP préserve ajout_terrain |
| Test backend | `backend/tests/test_receptions.py` | Association barcode → résolution, doublon 409 |
| Test import | `backend/tests/test_import.py` | Import FTP préserve codes ajout_terrain |

**Statut : ✅ Implémenté**

---

## Critère 5 — Isolation multi-tenant (magasinier ne voit pas les autres magasins)

**Énoncé** : Un magasinier ne voit jamais les réceptions d'un autre magasin.

| Composant | Fichier | Implémentation |
|---|---|---|
| Dépendance API | `backend/app/api/deps.py` | `require_magasin_access(magasin_id, user)` : 403 si magasinier/responsable tente d'accéder à un autre magasin |
| Filtre liste | `backend/app/api/receptions.py` | Liste filtrée sur `magasin_id` du user pour les rôles non-admin |
| Sync pull | `backend/app/api/sync.py` | `GET /sync/pull` filtre également sur `magasin_id` |
| Test backend | `backend/tests/test_multitenant.py` | Magasinier voit son magasin (200), 403 sur autre magasin, admin voit tout |
| Test E2E | `e2e/tests/01-saisie-online.spec.ts` | Vérifie absence d'erreur 403 et présence du bon nom de magasin |

**Statut : ✅ Implémenté**

---

## Critère 6 — Installation PWA sur Crosscall T4/T5

**Énoncé** : L'app s'installe sur Crosscall T4 et T5 comme PWA depuis Chrome.

| Composant | Fichier | Implémentation |
|---|---|---|
| Manifest PWA | `frontend/public/manifest.json` | `name`, `short_name`, `theme_color`, `display: standalone`, icônes 192/512 |
| Service Worker | `frontend/vite.config.ts` | `vite-plugin-pwa` + Workbox, stratégie NetworkFirst pour les API, CacheFirst pour assets |
| CSS tablette | `frontend/src/index.css` | Inputs 16px (prévient zoom iOS), cibles tactiles 44px min, `overscroll-behavior: none` |
| HTTPS | Nginx Proxy Manager (NPM) | Certificat Let's Encrypt géré par NPM — ports 8000/3000 exposés uniquement en loopback |
| Tests E2E | `e2e/playwright.config.ts` | Émulation Pixel 7 (800×1280), `hasTouch: true`, locale `fr-FR`, tz `America/Guadeloupe` |

**Vérification à effectuer manuellement** :
1. Ouvrir Chrome sur la tablette Crosscall T4/T5.
2. Naviguer vers l'URL de l'app.
3. Chrome doit proposer "Ajouter à l'écran d'accueil" (bannière ou menu ⋮).
4. L'app installée doit se lancer en mode plein écran (sans barre d'adresse).

**Statut : ✅ Implémenté côté code — validation terrain requise sur device physique**

---

## Résumé

| # | Critère | Statut |
|---|---|---|
| 1 | Import FTP → visible à 6h05 | ✅ Implémenté |
| 2 | Saisie mode avion + sync Wi-Fi | ✅ Implémenté |
| 3 | Validation responsable + PDF + mails | ✅ Implémenté |
| 4 | Association code-barres inconnu | ✅ Implémenté |
| 5 | Isolation multi-tenant | ✅ Implémenté |
| 6 | Installation PWA Crosscall | ✅ Implémenté (validation device physique requise) |

Tous les critères MVP sont couverts par du code livré et des tests automatisés. Le seul point nécessitant une validation manuelle est l'installation PWA sur les tablettes Crosscall réelles (T4/T5), qui ne peut pas être simulée en CI.
