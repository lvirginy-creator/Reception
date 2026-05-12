import { useEffect, useRef } from "react";
import { db } from "../db/database";
import { syncApi } from "../api/sync";
import { useOnlineStatus } from "./useOnlineStatus";

/**
 * Au retour online, envoie automatiquement les updates en attente (IndexedDB)
 * et rafraîchit les réceptions depuis le serveur.
 */
export function useSync(onSynced?: () => void) {
  const online = useOnlineStatus();
  const wasSyncing = useRef(false);

  useEffect(() => {
    if (!online || wasSyncing.current) return;

    const run = async () => {
      wasSyncing.current = true;
      try {
        // 1. Récupérer les updates en attente depuis IndexedDB
        const pending = await db.pending_updates.toArray();
        if (pending.length > 0) {
          // Regrouper par reception_id
          const byReception = new Map<number, typeof pending>();
          for (const u of pending) {
            const list = byReception.get(u.reception_id) ?? [];
            list.push(u);
            byReception.set(u.reception_id, list);
          }

          const updates = Array.from(byReception.entries()).map(([reception_id, items]) => ({
            reception_id,
            lignes: items
              .filter((i) => i.ligne_id > 0)
              .map((i) => ({
                ligne_id: i.ligne_id,
                quantite_recue: i.quantite_recue,
                commentaire: i.commentaire,
              })),
            nouvelles_lignes: [],
          }));

          const results = await syncApi.push(updates);
          // Supprimer les updates qui ont réussi
          const successIds = new Set(
            results.filter((r) => r.success).map((r) => r.reception_id)
          );
          const toDelete = pending
            .filter((p) => successIds.has(p.reception_id))
            .map((p) => p.id!)
            .filter((id) => id !== undefined);
          await db.pending_updates.bulkDelete(toDelete);
        }

        // 2. Rafraîchir les réceptions depuis le serveur
        const receptions = await syncApi.pull();
        const now = Date.now();
        await db.receptions.bulkPut(
          receptions.map((r) => ({ ...r, synced_at: now }))
        );

        onSynced?.();
      } catch (e) {
        console.warn("Sync échoué :", e);
      } finally {
        wasSyncing.current = false;
      }
    };

    run();
  }, [online]);

  return online;
}
