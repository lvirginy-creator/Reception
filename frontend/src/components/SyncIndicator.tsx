import { useEffect, useState } from "react";
import { db } from "../db/database";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export default function SyncIndicator() {
  const online = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const update = () => db.pending_updates.count().then(setPendingCount);
    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, []);

  if (online && pendingCount === 0) {
    return (
      <span style={styles.ok} title="Synchronisé">
        ● Synchronisé
      </span>
    );
  }
  if (online && pendingCount > 0) {
    return (
      <span style={styles.syncing} title={`${pendingCount} saisie(s) en cours de sync`}>
        ↑ Sync en cours…
      </span>
    );
  }
  return (
    <span style={styles.offline} title="Hors ligne — saisies sauvegardées localement">
      ⚠ Hors ligne {pendingCount > 0 ? `(${pendingCount} en attente)` : ""}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  ok:      { color: "#2d7d46", fontSize: 12, fontWeight: 600 },
  syncing: { color: "#e67e22", fontSize: 12, fontWeight: 600 },
  offline: { color: "#c0392b", fontSize: 12, fontWeight: 600 },
};
