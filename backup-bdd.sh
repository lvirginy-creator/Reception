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

# Charger les variables d'environnement depuis .env
if [ -f "${PROJECT_DIR}/.env" ]; then
    set -a; source "${PROJECT_DIR}/.env"; set +a
fi

PGUSER="${POSTGRES_USER:-reception}"
PGDB="${POSTGRES_DB:-reception_db}"

# --- Trouver le conteneur PostgreSQL ---
DB_CONTAINER=$(docker ps --filter "name=db" --filter "status=running" --format "{{.Names}}" | head -1)

if [ -z "${DB_CONTAINER}" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERREUR : aucun conteneur PostgreSQL trouvé (docker ps --filter name=db)"
    exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Conteneur cible : ${DB_CONTAINER}"

# --- Préparation ---
mkdir -p "${BACKUP_DIR}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILE="${BACKUP_DIR}/reception_${TIMESTAMP}.sql.gz"
TMP_FILE="${FILE}.tmp"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Début sauvegarde -> ${FILE}"

# --- Dump (fichier temporaire pour éviter un .gz vide en cas d'erreur) ---
if docker exec "${DB_CONTAINER}" pg_dump -U "${PGUSER}" "${PGDB}" | gzip > "${TMP_FILE}"; then
    mv "${TMP_FILE}" "${FILE}"
    SIZE=$(du -sh "${FILE}" | cut -f1)
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sauvegarde terminée : ${FILE} (${SIZE})"
else
    rm -f "${TMP_FILE}"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERREUR : pg_dump a échoué, fichier supprimé"
    exit 1
fi

# --- Rotation : suppression des fichiers de plus de RETENTION_DAYS jours ---
NB_DELETED=$(find "${BACKUP_DIR}" -maxdepth 1 -name 'reception_*.sql.gz' \
    -mtime +"${RETENTION_DAYS}" -print -delete | wc -l)

if [ "${NB_DELETED}" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Rotation : ${NB_DELETED} fichier(s) supprimé(s) (>${RETENTION_DAYS}j)"
fi

# --- Listing des sauvegardes disponibles ---
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sauvegardes existantes :"
ls -lh "${BACKUP_DIR}"/reception_*.sql.gz 2>/dev/null || echo "  (aucune)"
