import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { receptionsApi, type ReceptionArchiveItem } from "../api/receptions";

export default function Historique() {
  const [archives, setArchives] = useState<ReceptionArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    receptionsApi.historique()
      .then(setArchives)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout title="Historique">
      {loading && <div style={styles.loading}>Chargement…</div>}
      {!loading && archives.length === 0 && (
        <div style={styles.empty}>Aucune réception archivée.</div>
      )}
      {archives.map((a) => (
        <div key={a.id} style={styles.card}>
          <div style={styles.cardTop} onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
            <div style={styles.cardLeft}>
              <span style={styles.numero}>EN {a.numero_en}</span>
              <span style={styles.badge}>{a.statut}</span>
            </div>
            <div style={styles.cardRight}>
              <span style={styles.chevron}>{expanded === a.id ? "▲" : "▼"}</span>
            </div>
          </div>
          <div style={styles.fournisseur}>{a.fournisseur_nom}</div>
          <div style={styles.meta}>
            {a.valide_le && <>Validé le {new Date(a.valide_le).toLocaleDateString("fr-FR")} · </>}
            Archivé le {new Date(a.archived_at).toLocaleDateString("fr-FR")}
          </div>

          {expanded === a.id && a.lignes_json && a.lignes_json.length > 0 && (
            <div style={styles.lignesWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Réf.</th>
                    <th style={styles.th}>Désignation</th>
                    <th style={{ ...styles.th, textAlign: "center" }}>Attendu</th>
                    <th style={{ ...styles.th, textAlign: "center" }}>Reçu</th>
                    <th style={{ ...styles.th, textAlign: "center" }}>Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {a.lignes_json.map((l, i) => {
                    const ecart = l.quantite_attendue != null && l.quantite_recue != null
                      ? l.quantite_recue - l.quantite_attendue
                      : null;
                    return (
                      <tr key={i} style={i % 2 === 0 ? {} : { background: "#f9fafb" }}>
                        <td style={styles.td}>{l.reference_interne}</td>
                        <td style={styles.td}>{l.designation}</td>
                        <td style={{ ...styles.td, textAlign: "center" }}>{l.quantite_attendue ?? "—"}</td>
                        <td style={{ ...styles.td, textAlign: "center" }}>{l.quantite_recue ?? "—"}</td>
                        <td style={{ ...styles.td, textAlign: "center", color: ecart == null ? "#888" : ecart === 0 ? "#27ae60" : "#e74c3c", fontWeight: 600 }}>
                          {ecart == null ? "—" : ecart > 0 ? `+${ecart}` : ecart}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </Layout>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loading: { textAlign: "center", padding: 40, color: "#888" },
  empty:   { textAlign: "center", padding: 60, color: "#aaa", fontSize: 16 },
  card: {
    background: "#fff", borderRadius: 12, padding: "12px 16px",
    marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,.08)",
    borderLeft: "4px solid #95a5a6",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: 4 },
  cardLeft: { display: "flex", alignItems: "center", gap: 8 },
  cardRight: { color: "#aaa", fontSize: 12 },
  chevron: { color: "#aaa" },
  numero: { fontWeight: 700, fontSize: 15 },
  badge: {
    background: "#95a5a6", color: "#fff",
    borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600,
  },
  fournisseur: { fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 2 },
  meta: { fontSize: 11, color: "#9ca3af" },
  lignesWrap: { marginTop: 10, overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    background: "#1a3a6b", color: "#fff",
    padding: "6px 8px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap",
  },
  td: { padding: "5px 8px", borderBottom: "1px solid #e5e7eb" },
};
