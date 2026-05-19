/**
 * Vue responsable : récapitulatif complet, toggle saisie aveugle,
 * modification des quantités, confirmation et validation finale.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { receptionsApi, type Ligne, type ReceptionDetail } from "../api/receptions";

export default function Validation() {
  const { id } = useParams<{ id: string }>();
  const receptionId = Number(id);
  const navigate = useNavigate();

  const [reception, setReception] = useState<ReceptionDetail | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [validating, setValidating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await receptionsApi.get(receptionId);
      setReception(data);
      setLignes(data.lignes);
      setLoading(false);
    })();
  }, [receptionId]);

  const handleToggleAveugle = async () => {
    if (!reception) return;
    setToggling(true);
    try {
      await receptionsApi.toggleSaisieAveugle(receptionId, !reception.saisie_aveugle);
      setReception((r) => r ? { ...r, saisie_aveugle: !r.saisie_aveugle } : r);
    } finally {
      setToggling(false);
    }
  };

  const handleQtyChange = async (ligneId: number, val: string) => {
    const qty: number | null = val === "" ? null : parseInt(val, 10);
    setLignes((prev) => prev.map((l) => l.id === ligneId ? { ...l, quantite_recue: qty } : l));
    setSaving(ligneId);
    try {
      await receptionsApi.updateLigne(receptionId, ligneId, { quantite_recue: qty ?? undefined });
    } finally {
      setSaving(null);
    }
  };

  const handleValider = async () => {
    const nonSaisies = lignes.filter((l) => l.quantite_recue === null).length;
    if (nonSaisies > 0) {
      setError(`${nonSaisies} ligne(s) sans quantité — impossible de valider`);
      setConfirmOpen(false);
      return;
    }
    setValidating(true);
    setError("");
    try {
      await receptionsApi.valider(receptionId);
      navigate("/receptions");
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Erreur lors de la validation");
    } finally {
      setValidating(false);
      setConfirmOpen(false);
    }
  };

  if (loading) return <Layout><div style={{ padding: 40, textAlign: "center", color: "#888" }}>Chargement…</div></Layout>;
  if (!reception) return <Layout><div style={{ padding: 40 }}>Réception introuvable</div></Layout>;

  const isReadonly = reception.statut === "valide" || reception.statut === "envoye" || reception.statut === "archive";
  const nbEcarts = lignes.filter((l) => l.quantite_attendue !== null && l.quantite_recue !== null && l.quantite_recue !== l.quantite_attendue).length;
  const nbHC = lignes.filter((l) => l.ajout_hors_commande).length;
  const nbConformes = lignes.filter((l) => !l.ajout_hors_commande && l.quantite_attendue !== null && l.quantite_recue === l.quantite_attendue).length;

  return (
    <Layout title={`Validation — EN ${reception.numero_en}`} backTo="/receptions">
      {/* Recap */}
      <div style={styles.recapCard}>
        <div style={styles.fournisseur}>{reception.fournisseur_nom}</div>
        {reception.num_facture_fournisseur && (
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            Facture : <strong>{reception.num_facture_fournisseur}</strong>
          </div>
        )}
        <div style={styles.recapStats}>
          <Stat nb={nbConformes} label="Conforme(s)" color="#27ae60" />
          <Stat nb={nbEcarts} label="Écart(s)" color="#c0392b" />
          <Stat nb={nbHC} label="Hors cmd" color="#f39c12" />
        </div>
      </div>

      {/* Toggle saisie aveugle */}
      {!isReadonly && (
        <div style={styles.toggleCard}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Mode saisie à l'aveugle</span>
          <button
            style={{
              ...styles.toggle,
              background: reception.saisie_aveugle ? "#8e44ad" : "#ddd",
            }}
            onClick={handleToggleAveugle}
            disabled={toggling}
          >
            <div style={{ ...styles.toggleKnob, transform: reception.saisie_aveugle ? "translateX(22px)" : "translateX(2px)" }} />
          </button>
        </div>
      )}

      {error && <div style={styles.errorBanner}>{error}</div>}

      {/* Table des lignes */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Réf</th>
              <th style={styles.th}>Désignation</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Attendu</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Reçu</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Écart</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => {
              const ecart =
                l.quantite_attendue !== null && l.quantite_recue !== null
                  ? l.quantite_recue - l.quantite_attendue
                  : null;
              const rowBg =
                l.ajout_hors_commande
                  ? "#fff9f0"
                  : ecart === null
                  ? "#fff"
                  : ecart === 0
                  ? "#f0fff4"
                  : ecart < 0
                  ? "#fff0f0"
                  : "#fff8f0";

              return (
                <tr key={l.id} style={{ background: rowBg }}>
                  <td style={styles.td}>
                    <span style={styles.refTag}>{l.reference_interne}</span>
                    {l.ajout_hors_commande && <span style={styles.tagHC}>HC</span>}
                  </td>
                  <td style={{ ...styles.td, fontSize: 12 }}>
                    {l.designation}
                    {l.commentaire && <div style={styles.comment}>💬 {l.commentaire}</div>}
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    {l.quantite_attendue ?? "—"}
                  </td>
                  <td style={{ ...styles.td, textAlign: "right" }}>
                    {isReadonly ? (
                      <span style={{ fontWeight: 700 }}>{l.quantite_recue ?? "—"}</span>
                    ) : (
                      <input
                        style={styles.qtyInput}
                        type="number"
                        min="0"
                        value={l.quantite_recue?.toString() ?? ""}
                        onChange={(e) => handleQtyChange(l.id, e.target.value)}
                        disabled={saving === l.id}
                        inputMode="numeric"
                      />
                    )}
                  </td>
                  <td style={{ ...styles.td, textAlign: "right", fontWeight: 700, color: ecart === null ? "#aaa" : ecart === 0 ? "#27ae60" : ecart < 0 ? "#c0392b" : "#e67e22" }}>
                    {ecart === null ? "—" : ecart > 0 ? `+${ecart}` : ecart}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bouton valider */}
      {!isReadonly && (
        <div style={styles.validateBar}>
          <button
            style={styles.validateBtn}
            onClick={() => setConfirmOpen(true)}
            disabled={validating}
          >
            {validating ? "Validation en cours…" : "Valider et envoyer le rapport"}
          </button>
        </div>
      )}

      {isReadonly && (
        <div style={styles.doneBar}>
          ✓ Réception validée{reception.valide_le ? ` le ${new Date(reception.valide_le).toLocaleString("fr-FR")}` : ""}
        </div>
      )}

      {/* Modal de confirmation */}
      {confirmOpen && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmCard}>
            <div style={styles.confirmTitle}>Confirmer la validation ?</div>
            <div style={styles.confirmBody}>
              Cette action est irréversible. Le rapport PDF sera généré et envoyé par mail au service achats.
              {nbEcarts > 0 && <div style={{ color: "#c0392b", marginTop: 8, fontWeight: 600 }}>⚠ {nbEcarts} écart(s) détecté(s)</div>}
            </div>
            <div style={styles.confirmBtns}>
              <button style={styles.cancelBtn} onClick={() => setConfirmOpen(false)}>Annuler</button>
              <button style={styles.confirmBtn} onClick={handleValider} disabled={validating}>
                {validating ? "…" : "Valider"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Stat({ nb, label, color }: { nb: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: "center", minWidth: 70 }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{nb}</div>
      <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  recapCard: { background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,.08)" },
  fournisseur: { fontWeight: 700, fontSize: 16, marginBottom: 10 },
  recapStats: { display: "flex", gap: 20, justifyContent: "center", padding: "8px 0" },

  toggleCard: {
    background: "#fff", borderRadius: 12, padding: "12px 16px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,.08)",
  },
  toggle: {
    width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
    position: "relative", transition: "background .2s",
  },
  toggleKnob: {
    position: "absolute", top: 2, width: 22, height: 22, borderRadius: "50%",
    background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.3)",
    transition: "transform .2s",
  },

  errorBanner: { background: "#fde8e8", color: "#c0392b", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 14 },

  tableWrap: { overflowX: "auto" as const, borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.08)", marginBottom: 80 },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 13 },
  th: { background: "#1a3a6b", color: "#fff", padding: "8px 10px", fontWeight: 600, fontSize: 12 },
  td: { padding: "8px 10px", borderBottom: "1px solid #f0f0f0", verticalAlign: "middle" },
  refTag: { fontWeight: 700, color: "#1a3a6b", fontSize: 12, display: "block" },
  tagHC: { background: "#f39c12", color: "#fff", borderRadius: 4, padding: "0 4px", fontSize: 10, marginLeft: 4 },
  comment: { color: "#888", fontSize: 11, marginTop: 3 },
  qtyInput: { width: 64, textAlign: "center", padding: "4px 6px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14 },

  validateBar: { position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px", background: "#fff", boxShadow: "0 -2px 8px rgba(0,0,0,.12)", zIndex: 50 },
  validateBtn: { width: "100%", padding: 16, background: "#27ae60", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer" },
  doneBar: { textAlign: "center", padding: 20, color: "#27ae60", fontWeight: 700, fontSize: 16 },

  confirmOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 800, padding: 20 },
  confirmCard: { background: "#fff", borderRadius: 16, padding: 24, maxWidth: 380, width: "100%" },
  confirmTitle: { fontWeight: 700, fontSize: 18, marginBottom: 12 },
  confirmBody: { fontSize: 14, color: "#555", marginBottom: 20, lineHeight: 1.5 },
  confirmBtns: { display: "flex", gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, border: "1px solid #ccc", background: "#f5f5f5", fontSize: 15, cursor: "pointer" },
  confirmBtn: { flex: 1, padding: 14, borderRadius: 10, border: "none", background: "#27ae60", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" },
};
