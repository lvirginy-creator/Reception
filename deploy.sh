#!/bin/bash
set -e
cd /opt/reception
git pull
docker-compose down
docker-compose build --no-cache backend frontend
docker-compose up -d
echo "Deploy terminé à $(date)"
