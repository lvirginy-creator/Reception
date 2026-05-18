#!/usr/bin/env bash
# Sauvegarde PostgreSQL via pg_dump dans le conteneur Docker.
# Usage manuel : bash /opt/reception/backup-bdd.sh
# Planification cron (exemple 3h00 chaque nuit) :
#   0 3 * * * bash /opt/reception/backup-bdd.sh >> /var/log/reception-backup.log 2>&1

set -euo pipefail

# --- Configuration ---
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/opt/reception/backups}"
RETENTION_DAYS=${RETENTION_DAYS:-30}
COMPOSE_PROJECT="reception"   # nom du projet docker-compose (dossier parent)

# Charger les variables d'environnement depuis .env
if [ -f "${PROJECT_DIR}/.env" ]; then
    # shellcheck disable=SC1091
    set -a; source "${PROJECT_DIR}/.env"; set +a
fi

PGUSER="${POSTGRES_USER:-reception}"
PGDB="${POSTGRES_DB:-reception_db}"

# --- Préparation ---
mkdir -p "${BACKUP_DIR}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILE="${BACKUP_DIR}/reception_${TIMESTAMP}.sql.gz"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Début sauvegarde -> ${FILE}"

# --- Dump ---
docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T db \
    pg_dump -U "${PGUSER}" "${PGDB}" \
    | gzip > "${FILE}"

SIZE=$(du -sh "${FILE}" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sauvegarde terminée : ${FILE} (${SIZE})"

# --- Rotation : suppression des fichiers de plus de RETENTION_DAYS jours ---
NB_DELETED=$(find "${BACKUP_DIR}" -maxdepth 1 -name 'reception_*.sql.gz' \
    -mtime +"${RETENTION_DAYS}" -print -delete | wc -l)

if [ "${NB_DELETED}" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rotation : ${NB_DELETED} fichier(s) supprimé(s) (>${RETENTION_DAYS}j)"
fi

# --- Listing des sauvegardes disponibles ---
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sauvegardes existantes :"
ls -lh "${BACKUP_DIR}"/reception_*.sql.gz 2>/dev/null || echo "  (aucune)"
