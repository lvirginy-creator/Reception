import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { receptionsApi, type Reception } from "../api/receptions";
import { db } from "../db/database";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useAuthStore } from "../store/authStore";

const STATUT_LABELS: Record<string, string> = {
  en_cours: "En cours",
  prete: "Prête à valider",
  valide: "Validée",
  envoye: "Envoyée",
  archive: "Archivée",
};

const STATUT_COLORS: Record<string, string> = {
  en_cours: "#e67e22",
  prete:    "#2980b9",
  valide:   "#27ae60",
  envoye:   "#27ae60",
  archive:  "#95a5a6",
};

export default function Receptions() {
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreFournisseur, setFiltreFournisseur] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const user = useAuthStore((s) => s.user);
  const isResponsable = user?.role === "responsable" || user?.role === "admin";

  const load = async () => {
    setLoading(true);
    try {
      if (online) {
        const data = await receptionsApi.list({
          statut: filtreStatut || undefined,
          fournisseur: filtreFournisseur || undefined,
        });
        setReceptions(data);
        // Mettre à jour IndexedDB
        const now = Date.now();
        await db.receptions.bulkPut(data.map((r) => ({ ...r, lignes: [], synced_at: now })));
      } else {
        // Mode hors ligne : lire IndexedDB
        let all = await db.receptions.toArray();
        if (filtreStatut) all = all.filter((r) => r.statut === filtreStatut);
        if (filtreFournisseur) all = all.filter((r) =>
          r.fournisseur_nom.toLowerCase().includes(filtreFournisseur.toLowerCase())
        );
        setReceptions(all.sort((a, b) => b.numero_en.localeCompare(a.numero_en)) as Reception[]);
      }
    } catch {
      // Fallback IndexedDB si erreur réseau
      const all = await db.receptions.toArray();
      setReceptions(all.sort((a, b) => b.numero_en.localeCompare(a.numero_en)) as Reception[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [online, filtreStatut, filtreFournisseur]);

  const actives = receptions.filter((r) => r.statut === "en_cours" || r.statut === "prete");
  const autres = receptions.filter((r) => r.statut !== "en_cours" && r.statut !== "prete");

  return (
    <Layout title="Mes réceptions">
      {/* Filtres */}
      <div style={styles.filters}>
        <select
          style={styles.select}
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="en_cours">En cours</option>
          <option value="prete">Prête à valider</option>
          <option value="valide">Validée</option>
          <option value="envoye">Envoyée</option>
        </select>
        <input
          style={styles.searchInput}
          placeholder="Filtrer par fournisseur…"
          value={filtreFournisseur}
          onChange={(e) => setFiltreFournisseur(e.target.value)}
        />
        <button style={styles.refreshBtn} onClick={load}>↻</button>
      </div>

      {loading && <div style={styles.loading}>Chargement…</div>}

      {!loading && receptions.length === 0 && (
        <div style={styles.empty}>Aucune réception pour le moment.</div>
      )}

      {actives.length > 0 && (
        <>
          <div style={styles.sectionLabel}>En attente de saisie / validation</div>
          {actives.map((r) => (
            <ReceptionCard
              key={r.id}
              reception={r}
              onClick={() => navigate(`/receptions/${r.id}`)}
              onValider={isResponsable && r.statut === "prete" ? () => navigate(`/receptions/${r.id}/validation`) : undefined}
            />
          ))}
        </>
      )}

      {autres.length > 0 && (
        <>
          <div style={styles.sectionLabel}>Terminées</div>
          {autres.map((r) => (
            <ReceptionCard
              key={r.id}
              reception={r}
              onClick={() => navigate(`/receptions/${r.id}`)}
              onValider={isResponsable && r.statut === "prete" ? () => navigate(`/receptions/${r.id}/validation`) : undefined}
            />
          ))}
        </>
      )}
    </Layout>
  );
}

function ReceptionCard({ reception: r, onClick, onValider }: { reception: Reception; onClick: () => void; onValider?: () => void }) {
  const pct = r.total_lignes > 0 ? Math.round((r.lignes_saisies / r.total_lignes) * 100) : 0;
  const allSaisies = r.lignes_saisies === r.total_lignes && r.total_lignes > 0;

  return (
    <div style={styles.card} onClick={onClick}>
      <div style={styles.cardTop}>
        <div>
          <span style={styles.numeroEn}>EN {r.numero_en}</span>
          <span style={{ ...styles.badge, background: STATUT_COLORS[r.statut] ?? "#888" }}>
            {STATUT_LABELS[r.statut] ?? r.statut}
          </span>
        </div>
        <div style={styles.lignesBadge}>
          <span style={{ color: allSaisies ? "#27ae60" : "#e67e22", fontWeight: 700 }}>
            {r.lignes_saisies}/{r.total_lignes}
          </span>
          <span style={styles.lignesLabel}> lignes</span>
        </div>
      </div>

      <div style={styles.fournisseur}>{r.fournisseur_nom}</div>
      <div style={styles.meta}>
        Code : {r.code_fournisseur} · Importé le {new Date(r.date_import).toLocaleDateString("fr-FR")}
        {r.saisie_aveugle && <span style={styles.tagAveugle}> · 👁 aveugle</span>}
      </div>

      {/* Barre de progression */}
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${pct}%`, background: allSaisies ? "#27ae60" : "#2980b9" }} />
      </div>

      {/* Bouton valider (responsable uniquement, statut prete) */}
      {onValider && (
        <button
          style={styles.validerBtn}
          onClick={(e) => { e.stopPropagation(); onValider(); }}
        >
          ✓ Valider cette réception
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  filters: { display: "flex", gap: 8, marginBottom: 14, alignItems: "center" },
  select: { padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, flex: 1 },
  searchInput: { padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, flex: 2 },
  refreshBtn: { padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", fontSize: 18, cursor: "pointer" },
  loading: { textAlign: "center", padding: 40, color: "#888" },
  empty: { textAlign: "center", padding: 60, color: "#aaa", fontSize: 16 },
  sectionLabel: { fontWeight: 700, color: "#1a3a6b", fontSize: 13, textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 6px" },
  card: {
    background: "#fff", borderRadius: 12, padding: "14px 16px",
    marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,.1)",
    cursor: "pointer", userSelect: "none",
    borderLeft: "4px solid #1a3a6b",
    transition: "box-shadow .15s",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  numeroEn: { fontWeight: 700, fontSize: 16, marginRight: 8 },
  badge: { color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 },
  fournisseur: { fontWeight: 600, fontSize: 14, marginBottom: 2 },
  meta: { fontSize: 12, color: "#888" },
  tagAveugle: { color: "#8e44ad" },
  lignesBadge: { textAlign: "right", fontSize: 15 },
  lignesLabel: { fontSize: 11, color: "#888" },
  progressBar: { height: 4, background: "#e0e0e0", borderRadius: 4, marginTop: 10, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4, transition: "width .3s" },
  validerBtn: {
    display: "block", width: "100%", marginTop: 10,
    padding: "10px", background: "#27ae60", color: "#fff",
    border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700,
    cursor: "pointer",
  },
};
