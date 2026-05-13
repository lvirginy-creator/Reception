#!/bin/bash
# Import manuel du fichier codes-barres depuis le FTP
set -e

echo "=== Import FTP Codes-barres ==="
echo "Démarrage à $(date)"

docker exec reception_backend_1 python -c "
import asyncio
from app.services.import_ftp import import_codes_barres
from app.core.database import AsyncSessionLocal

async def run():
    async with AsyncSessionLocal() as db:
        log = await import_codes_barres(db)
        await db.commit()
        print('Statut     :', log.statut.value)
        print('Fichier    :', log.fichier_nom)
        print('Traitées   :', log.lignes_traitees)
        print('Erreurs    :', log.lignes_erreur)
        if log.message_erreur:
            print('Message    :', log.message_erreur)

asyncio.run(run())
"

echo "Terminé à $(date)"
