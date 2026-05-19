#!/bin/bash
set -e
cd /opt/reception
git pull
docker-compose down
docker-compose build --no-cache backend frontend
docker-compose up -d
echo "Attente du démarrage du backend..."
sleep 5
docker-compose exec -T backend alembic upgrade head
echo "Deploy terminé à $(date)"
