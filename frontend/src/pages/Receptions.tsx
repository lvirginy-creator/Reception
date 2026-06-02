import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { receptionsApi, type Reception } from "../api/receptions";
import { db } from "../db/database";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useAuthStore } from "../store/authStore";

type ArchiveConfirm = { id: number; label: string } | null;

const STATUT_LABELS: Record<string, string> = {
  en_cours: "En cours",
  prete: "Prête à valider",
  valide: "Validée",
  envoye: "Envoyée",
  archive: "Archivée",
  ancien: "Ancien",
};

const STATUT_COLORS: Record<string, string> = {
  en_cours: "#e67e22",
  prete:    "#2980b9",
  valide:   "#27ae60",
  envoye:   "#27ae60",
  archive:  "#95a5a6",
  ancien:   "#95a5a6",
};

const STORAGE_KEY = "receptions_filtres";

function loadFiltres() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as { statut: string; fournisseur: string; en: string };
  } catch { /* ignore */ }
  return { statut: "", fournisseur: "", en: "" };
}

function saveFiltres(statut: string, fournisseur: string, en: string) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ statut, fournisseur, en }));
}

export default function Receptions() {
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const saved = loadFiltres();
  const [filtreStatut, setFiltreStatutState] = useState(saved.statut);
  const [filtreFournisseur, setFiltreFournisseurState] = useState(saved.fournisseur);
  const [filtreEN, setFiltreENState] = useState(saved.en);
  const [loading, setLoading] = useState(true);

  const setFiltreStatut = (v: string) => { setFiltreStatutState(v); saveFiltres(v, filtreFournisseur, filtreEN); };
  const setFiltreFournisseur = (v: string) => { setFiltreFournisseurState(v); saveFiltres(filtreStatut, v, filtreEN); };
  const setFiltreEN = (v: string) => { setFiltreENState(v); saveFiltres(filtreStatut, filtreFournisseur, v); };
  const [archiveConfirm, setArchiveConfirm] = useState<ArchiveConfirm>(null);
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const user = useAuthStore((s) => s.user);
  const isResponsable = user?.role === "responsable" || user?.role === "admin";

  const confirmArchive = async () => {
    if (!archiveConfirm) return;
    try {
      await receptionsApi.archiver(archiveConfirm.id);
      setArchiveConfirm(null);
      await load();
    } catch {
      setArchiveConfirm(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      if (online) {
        const data = await receptionsApi.list({
          statut: filtreStatut || undefined,
          fournisseur: filtreFournisseur || undefined,
        });
        setReceptions(data);
        const now = Date.now();
        await db.receptions.bulkPut(data.map((r) => ({ ...r, lignes: [], synced_at: now })));
      } else {
        let all = await db.receptions.toArray();
        if (filtreStatut) all = all.filter((r) => r.statut === filtreStatut);
        if (filtreFournisseur) {
          const q = filtreFournisseur.toLowerCase();
          all = all.filter((r) =>
            r.fournisseur_nom.toLowerCase().includes(q) ||
            r.code_fournisseur.toLowerCase().includes(q)
          );
        }
        setReceptions(all.sort((a, b) => b.numero_en.localeCompare(a.numero_en)) as Reception[]);
      }
    } catch {
      const all = await db.receptions.toArray();
      setReceptions(all.sort((a, b) => b.numero_en.localeCompare(a.numero_en)) as Reception[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [online, filtreStatut, filtreFournisseur]);

  const filtered = filtreEN
    ? receptions.filter((r) =>
        r.numero_en.toLowerCase().includes(filtreEN.toLowerCase().replace(/^en\s*/i, ""))
      )
    : receptions;

  const actives = filtered.filter((r) => r.statut === "en_cours" || r.statut === "prete");
  const autres = filtered.filter((r) => r.statut !== "en_cours" && r.statut !== "prete");

  return (
    <Layout title="Mes réceptions">
      <div style={styles.filtersWrap}>
        <div style={styles.filtersRow1}>
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
          <button style={styles.refreshBtn} onClick={load}>↻</button>
        </div>
        <div style={styles.filtersRow2}>
          <input
            style={styles.searchInput}
            placeholder="N° EN…"
            value={filtreEN}
            onChange={(e) => setFiltreEN(e.target.value)}
          />
          <input
            style={{ ...styles.searchInput, flex: 2 }}
            placeholder="Fournisseur ou code…"
            value={filtreFournisseur}
            onChange={(e) => setFiltreFournisseur(e.target.value)}
          />
        </div>
      </div>

      {loading && <div style={styles.loading}>Chargement…</div>}

      {!loading && filtered.length === 0 && (
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
              onArchiver={isResponsable && r.statut === "en_cours"
                ? () => setArchiveConfirm({ id: r.id, label: `${r.fournisseur_nom}${r.num_facture_fournisseur ? " — " + r.num_facture_fournisseur : ""}` })
                : undefined}
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

      {archiveConfirm && (
        <div style={styles.modalBackdrop} onClick={() => setArchiveConfirm(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalIcon}>🗂️</div>
            <div style={styles.modalTitle}>Archiver cette réception ?</div>
            <div style={styles.modalBody}>
              <strong>{archiveConfirm.label}</strong><br /><br />
              Cette réception passera au statut <strong>Ancien</strong>.<br />
              Cette action est <strong>irréversible</strong>.
            </div>
            <div style={styles.modalActions}>
              <button style={styles.btnCancel} onClick={() => setArchiveConfirm(null)}>Annuler</button>
              <button style={styles.btnConfirm} onClick={confirmArchive}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function ReceptionCard({ reception: r, onClick, onValider, onArchiver }: { reception: Reception; onClick: () => void; onValider?: () => void; onArchiver?: () => void }) {
  const pct = r.total_lignes > 0 ? Math.round((r.lignes_saisies / r.total_lignes) * 100) : 0;
  const allSaisies = r.lignes_saisies === r.total_lignes && r.total_lignes > 0;

  return (
    <div style={styles.card} onClick={onClick}>
      <div style={styles.cardTop}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
          <span style={styles.numeroEn}>EN {r.numero_en}</span>
          <span style={{ ...styles.badge, background: STATUT_COLORS[r.statut] ?? "#888" }}>
            {STATUT_LABELS[r.statut] ?? r.statut}
          </span>
          {onArchiver && (
            <button
              style={styles.btnArchiver}
              onClick={(e) => { e.stopPropagation(); onArchiver(); }}
            >
              ⊘ Archiver
            </button>
          )}
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
        {r.code_fournisseur}
        {r.num_facture_fournisseur && <span> · Facture : {r.num_facture_fournisseur}</span>}
        <span> · Importé le {new Date(r.date_import).toLocaleDateString("fr-FR")}</span>
        {r.saisie_aveugle && <span style={styles.tagAveugle}> · 👁 aveugle</span>}
      </div>

      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${pct}%`, background: allSaisies ? "#27ae60" : "#2980b9" }} />
      </div>

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
  filtersWrap: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
  filtersRow1: { display: "flex", gap: 8, alignItems: "center" },
  filtersRow2: { display: "flex", gap: 8 },
  select: { padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, flex: 1 },
  searchInput: { flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14 },
  refreshBtn: { padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", fontSize: 18, cursor: "pointer", flexShrink: 0 },
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
  btnArchiver: {
    fontSize: 11, fontWeight: 600,
    color: "#6b7280", background: "#f3f4f6",
    border: "1px solid #d1d5db", borderRadius: 6,
    padding: "2px 8px", cursor: "pointer", whiteSpace: "nowrap" as const,
  },
  modalBackdrop: {
    position: "fixed" as const, inset: 0,
    background: "rgba(0,0,0,.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 200,
  },
  modal: {
    background: "#fff", borderRadius: 14, padding: "28px 24px",
    maxWidth: 340, width: "90%",
    boxShadow: "0 8px 32px rgba(0,0,0,.2)", textAlign: "center" as const,
  },
  modalIcon: { fontSize: 36, marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#1a3a6b", marginBottom: 8 },
  modalBody: { fontSize: 13, color: "#555", lineHeight: 1.6, marginBottom: 20 },
  modalActions: { display: "flex", gap: 10 },
  btnCancel: {
    flex: 1, padding: 10, borderRadius: 8,
    border: "1px solid #d1d5db", background: "#fff",
    fontSize: 14, fontWeight: 600, color: "#374151", cursor: "pointer",
  },
  btnConfirm: {
    flex: 1, padding: 10, borderRadius: 8,
    border: "none", background: "#95a5a6",
    fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer",
  },
};
