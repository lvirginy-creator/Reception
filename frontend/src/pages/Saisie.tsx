import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { useBarcodeInput, CameraScanner } from "../components/BarcodeScanner";
import ArticleSearchModal from "../components/ArticleSearchModal";
import PhotoCapture from "../components/PhotoCapture";
import AjoutHorsCommande from "../components/AjoutHorsCommande";
import { receptionsApi, type Ligne, type ReceptionDetail } from "../api/receptions";
import { articlesApi, type Article } from "../api/articles";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useAuthStore } from "../store/authStore";
import { db } from "../db/database";
import { syncApi } from "../api/sync";

type Modal =
  | { type: "camera" }
  | { type: "search"; barcode?: string }
  | { type: "hors-commande"; prefill?: { article: Article; barcode: string } }
  | { type: "photo"; ligneId: number }
  | { type: "quantity"; ligne: Ligne };

export default function Saisie() {
  const { id } = useParams<{ id: string }>();
  const receptionId = Number(id);
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const user = useAuthStore((s) => s.user);
  const isResponsable = user?.role === "responsable" || user?.role === "admin";

  const [reception, setReception] = useState<ReceptionDetail | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [toggling, setToggling] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [error, setError] = useState("");
  const [terminerLoading, setTerminerLoading] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const ligneRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const isReadonly =
    reception?.statut === "valide" ||
    reception?.statut === "envoye" ||
    reception?.statut === "archive";

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (online) {
          const data = await receptionsApi.get(receptionId);
          setReception(data);
          setLignes(data.lignes);
          await db.receptions.put({ ...data, synced_at: Date.now() });
        } else {
          const local = await db.receptions.get(receptionId);
          if (local) {
            setReception(local as any);
            setLignes((local as any).lignes ?? []);
          }
        }
      } catch {
        const local = await db.receptions.get(receptionId);
        if (local) {
          setReception(local as any);
          setLignes((local as any).lignes ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [receptionId, online]);

  const handleToggleAveugle = async () => {
    if (!reception || toggling) return;
    setToggling(true);
    try {
      await receptionsApi.toggleSaisieAveugle(receptionId, !reception.saisie_aveugle);
      setReception((r) => r ? { ...r, saisie_aveugle: !r.saisie_aveugle } : r);
    } finally {
      setToggling(false);
    }
  };

  const saveLigne = useCallback(
    async (ligneId: number, quantite_recue: number | null, commentaire?: string) => {
      setSaving(ligneId);
      try {
        setLignes((prev) =>
          prev.map((l) =>
            l.id === ligneId
              ? { ...l, quantite_recue, commentaire: commentaire ?? l.commentaire }
              : l
          )
        );
        if (online) {
          await receptionsApi.updateLigne(receptionId, ligneId, { quantite_recue: quantite_recue ?? undefined, commentaire });
        } else {
          const existing = await db.pending_updates
            .where({ reception_id: receptionId })
            .filter((u) => u.ligne_id === ligneId)
            .first();
          if (existing?.id) {
            await db.pending_updates.update(existing.id, { quantite_recue, commentaire: commentaire ?? null });
          } else {
            await db.pending_updates.add({
              reception_id: receptionId,
              ligne_id: ligneId,
              quantite_recue,
              commentaire: commentaire ?? null,
              created_at: Date.now(),
            });
          }
        }
        const cached = await db.receptions.get(receptionId);
        if (cached) {
          const updatedLignes = ((cached as any).lignes ?? []).map((l: Ligne) =>
            l.id === ligneId ? { ...l, quantite_recue, commentaire: commentaire ?? l.commentaire } : l
          );
          await db.receptions.update(receptionId, { lignes: updatedLignes } as any);
        }
      } finally {
        setSaving(null);
      }
    },
    [online, receptionId]
  );

  const handleScan = useCallback(
    async (code: string) => {
      try {
        const article = await articlesApi.getByBarcode(code);
        const ligne = lignes.find((l) => l.reference_interne === article.reference_interne);
        if (ligne) {
          setHighlightId(ligne.id);
          setTimeout(() => setHighlightId(null), 1500);
          ligneRefs.current.get(ligne.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
          setModal({ type: "quantity", ligne });
          return;
        }
        const artObj: Article = { id: article.id, reference_interne: article.reference_interne, designation: article.designation };
        setModal({ type: "hors-commande", prefill: { article: artObj, barcode: code } });
      } catch (e: any) {
        if (e.response?.status === 404) {
          setModal({ type: "search", barcode: code });
        }
      }
    },
    [lignes]
  );

  useBarcodeInput(handleScan, !isReadonly && modal === null);

  const handleTerminer = async () => {
    const nonSaisies = lignes.filter((l) => l.quantite_recue === null).length;
    if (nonSaisies > 0) {
      setError(`${nonSaisies} ligne(s) sans quantité saisie. Saisissez 0 si rien n'a été reçu.`);
      return;
    }
    setTerminerLoading(true);
    setError("");
    try {
      if (!online) {
        await syncApi.push([{
          reception_id: receptionId,
          lignes: lignes.map((l) => ({ ligne_id: l.id, quantite_recue: l.quantite_recue, commentaire: l.commentaire })),
          nouvelles_lignes: [],
          terminer: true,
        }]);
      }
      const updated = await receptionsApi.terminer(receptionId);
      setReception((r) => r ? { ...r, statut: updated.statut } : r);
      navigate("/receptions");
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Erreur lors de la soumission");
    } finally {
      setTerminerLoading(false);
    }
  };

  const handleAddHorsCommande = async (data: {
    reference_interne: string;
    designation: string;
    article_id?: number;
    quantite_recue?: number;
  }) => {
    const res = await receptionsApi.addLigne(receptionId, { ...data, reference_fournisseur: undefined });
    const newLigne: Ligne = {
      id: res.id, reception_id: receptionId, article_id: data.article_id ?? null,
      reference_interne: data.reference_interne, reference_fournisseur: null,
      designation: data.designation, quantite_attendue: null,
      quantite_recue: data.quantite_recue ?? null, ajout_hors_commande: true,
      commentaire: null, modifie_le: null, photos: [],
    };
    setLignes((prev) => [...prev, newLigne]);
  };

  const nbSaisies = lignes.filter((l) => l.quantite_recue !== null).length;
  const pct = lignes.length > 0 ? Math.round((nbSaisies / lignes.length) * 100) : 0;

  if (loading) return <Layout><div style={{ padding: 40, textAlign: "center", color: "#888" }}>Chargement…</div></Layout>;
  if (!reception) return <Layout><div style={{ padding: 40, textAlign: "center", color: "#888" }}>Réception introuvable</div></Layout>;

  return (
    <Layout title={`EN ${reception.numero_en}`} backTo="/receptions">
      <div style={styles.recapCard}>
        <div style={styles.fournisseur}>{reception.fournisseur_nom}</div>
        {reception.num_facture_fournisseur && (
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
            Facture : <strong>{reception.num_facture_fournisseur}</strong>
          </div>
        )}
        <div style={styles.metaRow}>
          {reception.saisie_aveugle && <span style={styles.tagAveugle}>👁 Saisie à l'aveugle</span>}
          <span style={styles.metaItem}>{nbSaisies}/{lignes.length} lignes saisies</span>
        </div>
        <div style={styles.progressBar}><div style={{ ...styles.progressFill, width: `${pct}%` }} /></div>

        {isResponsable && !isReadonly && (
          <div style={styles.toggleRow}>
            <span style={styles.toggleLabel}>
              Saisie à l'aveugle
              <span style={{ fontWeight: 400, color: "#999", fontSize: 11, marginLeft: 6 }}>
                ({reception.saisie_aveugle ? "activée" : "désactivée"})
              </span>
            </span>
            <button
              style={{ ...styles.toggle, background: reception.saisie_aveugle ? "#8e44ad" : "#ccc", opacity: toggling ? 0.6 : 1 }}
              onClick={handleToggleAveugle}
              disabled={toggling}
            >
              <div style={{ ...styles.toggleKnob, transform: reception.saisie_aveugle ? "translateX(22px)" : "translateX(2px)" }} />
            </button>
          </div>
        )}
      </div>

      {!isReadonly && (
        <div style={styles.actionsRow}>
          <button style={styles.btnCamera} onClick={() => setModal({ type: "camera" })}>📷 Caméra</button>
          <button style={styles.btnSearch} onClick={() => setModal({ type: "search" })}>🔍 Recherche</button>
          <button style={styles.btnHorsCommande} onClick={() => setModal({ type: "hors-commande" })}>+ Hors commande</button>
        </div>
      )}

      {error && <div style={styles.errorBanner}>{error}</div>}

      <div style={styles.lignesList}>
        {lignes.map((l) => (
          <LigneRow
            key={l.id}
            ligne={l}
            saisieAveugle={reception.saisie_aveugle}
            highlighted={highlightId === l.id}
            saving={saving === l.id}
            readonly={isReadonly}
            onTap={() => setModal({ type: "quantity", ligne: l })}
            onPhoto={() => setModal({ type: "photo", ligneId: l.id })}
            ref_={ligneRefs}
          />
        ))}
      </div>

      {!isReadonly && reception.statut === "en_cours" && (
        <div style={styles.terminerBar}>
          <button style={{ ...styles.terminerBtn, opacity: terminerLoading ? 0.7 : 1 }} onClick={handleTerminer} disabled={terminerLoading}>
            {terminerLoading ? "Envoi…" : `Terminer la saisie (${nbSaisies}/${lignes.length})`}
          </button>
        </div>
      )}

      {reception.statut === "prete" && (
        <div style={styles.preteBar}>✓ Saisie terminée — en attente de validation responsable</div>
      )}

      {modal?.type === "quantity" && (
        <QuantityScanModal
          ligne={modal.ligne}
          saisieAveugle={reception.saisie_aveugle}
          onConfirm={(qty, comment) => { saveLigne(modal.ligne.id, qty, comment); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "camera" && (
        <CameraScanner onScan={(code) => { setModal(null); handleScan(code); }} onClose={() => setModal(null)} />
      )}
      {modal?.type === "search" && (
        <ArticleSearchModal
          unknownBarcode={modal.barcode}
          localLines={lignes}
          title={modal.barcode ? "Code-barres inconnu" : "Recherche article"}
          onSelect={(article, barcode) => {
            setModal(null);
            const ligne = lignes.find((l) => l.reference_interne === article.reference_interne);
            if (ligne) {
              setModal({ type: "quantity", ligne });
              ligneRefs.current.get(ligne.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
            } else if (barcode) {
              setModal({ type: "hors-commande", prefill: { article, barcode } });
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "hors-commande" && (
        <AjoutHorsCommande prefill={modal.prefill} onAdd={handleAddHorsCommande} onClose={() => setModal(null)} />
      )}
      {modal?.type === "photo" && (() => {
        const ligne = lignes.find((l) => l.id === modal.ligneId);
        if (!ligne) return null;
        return (
          <div style={styles.photoModalOverlay} onClick={() => setModal(null)}>
            <div style={styles.photoModal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.photoModalHeader}>
                <span style={{ fontWeight: 700 }}>Photos — {ligne.designation}</span>
                <button style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }} onClick={() => setModal(null)}>✕</button>
              </div>
              <div style={{ padding: "12px 16px 24px" }}>
                <PhotoCapture
                  photos={ligne.photos}
                  readonly={isReadonly}
                  onUpload={async (file) => {
                    await receptionsApi.uploadPhoto(receptionId, ligne.id, file);
                    if (online) { const updated = await receptionsApi.get(receptionId); setLignes(updated.lignes); }
                  }}
                />
              </div>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
}

// --- Modale saisie quantité avec pavé numérique ---
const KEYPAD_ROWS = [
  ["7", "8", "9"],
  ["4", "5", "6"],
  ["1", "2", "3"],
  ["C", "0", "⌫"],
];

function QuantityScanModal({
  ligne, saisieAveugle, onConfirm, onClose,
}: {
  ligne: Ligne; saisieAveugle: boolean;
  onConfirm: (qty: number | null, comment?: string) => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(ligne.quantite_recue !== null ? String(ligne.quantite_recue) : "");
  const [comment, setComment] = useState(ligne.commentaire ?? "");

  const pressKey = (key: string) => {
    if (key === "C") { setQty(""); return; }
    if (key === "⌫") { setQty((p) => p.slice(0, -1)); return; }
    setQty((p) => {
      if (p === "0") return key;
      if (p.length >= 5) return p;
      return p + key;
    });
  };

  const confirm = () => {
    const parsed = qty === "" ? null : parseInt(qty, 10);
    onConfirm(Number.isNaN(parsed as number) ? null : parsed, comment || undefined);
  };

  const qtyNum = qty === "" ? null : parseInt(qty, 10);
  const ecart =
    !saisieAveugle && ligne.quantite_attendue !== null && qtyNum !== null
      ? qtyNum - ligne.quantite_attendue
      : null;
  const ecartColor = ecart === null ? "#aaa" : ecart === 0 ? "#27ae60" : ecart < 0 ? "#c0392b" : "#e67e22";

  return (
    <div style={qStyles.overlay} onClick={onClose}>
      <div style={qStyles.card} onClick={(e) => e.stopPropagation()}>
        <div style={qStyles.header}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={qStyles.ref}>{ligne.reference_interne}</span>
            {ligne.reference_fournisseur && <span style={qStyles.refFourn}> · {ligne.reference_fournisseur}</span>}
          </div>
          <button style={qStyles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={qStyles.designation}>{ligne.designation}</div>

        <div style={qStyles.displayRow}>
          <div style={qStyles.displayBox}>
            <div style={qStyles.displayLabel}>Reçu</div>
            <div style={qStyles.displayValue}>
              {qty === "" ? <span style={{ color: "#ccc" }}>—</span> : qty}
            </div>
          </div>
          {!saisieAveugle && ligne.quantite_attendue !== null && (
            <div style={qStyles.displayBox}>
              <div style={qStyles.displayLabel}>Attendu</div>
              <div style={{ ...qStyles.displayValue, fontSize: 22, color: "#555" }}>
                {ligne.quantite_attendue}
              </div>
            </div>
          )}
          {ecart !== null && (
            <div style={qStyles.displayBox}>
              <div style={qStyles.displayLabel}>Écart</div>
              <div style={{ ...qStyles.displayValue, fontSize: 22, color: ecartColor, fontWeight: 700 }}>
                {ecart > 0 ? `+${ecart}` : ecart}
              </div>
            </div>
          )}
        </div>

        <div style={qStyles.keypad}>
          {KEYPAD_ROWS.map((row, ri) => (
            <div key={ri} style={qStyles.keyRow}>
              {row.map((k) => (
                <button
                  key={k}
                  style={{ ...qStyles.key, ...(k === "C" ? qStyles.keyC : {}), ...(k === "⌫" ? qStyles.keyDel : {}) }}
                  onPointerDown={(e) => { e.preventDefault(); pressKey(k); }}
                >
                  {k}
                </button>
              ))}
            </div>
          ))}
        </div>

        <textarea
          style={qStyles.comment}
          placeholder="Commentaire (optionnel)…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
        />

        <div style={qStyles.btnRow}>
          <button style={qStyles.btnCancel} onClick={onClose}>Annuler</button>
          <button style={qStyles.btnConfirm} onClick={confirm}>✓ Valider</button>
        </div>
      </div>
    </div>
  );
}

const qStyles: Record<string, React.CSSProperties> = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 900 },
  card: { background: "#fff", borderRadius: 16, padding: "16px 16px 14px", width: "min(400px, 97vw)", boxShadow: "0 8px 32px rgba(0,0,0,.25)", maxHeight: "95vh", overflowY: "auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  ref: { fontWeight: 700, fontSize: 13, color: "#1a3a6b", background: "#eef2ff", padding: "2px 8px", borderRadius: 5 },
  refFourn: { fontSize: 12, color: "#888" },
  closeBtn: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888", lineHeight: 1, flexShrink: 0 },
  designation: { fontSize: 15, fontWeight: 600, color: "#222", marginBottom: 12, lineHeight: 1.3 },
  displayRow: { display: "flex", gap: 8, marginBottom: 14, justifyContent: "center" },
  displayBox: { flex: 1, background: "#f0f4f8", borderRadius: 10, padding: "8px 6px", textAlign: "center" },
  displayLabel: { fontSize: 10, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  displayValue: { fontSize: 32, fontWeight: 800, lineHeight: 1, color: "#1a3a6b" },
  keypad: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 },
  keyRow: { display: "flex", gap: 8 },
  key: { flex: 1, height: 56, fontSize: 22, fontWeight: 700, borderRadius: 10, border: "1px solid #e0e0e0", background: "#f8f9fc", color: "#222", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", justifyContent: "center", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" },
  keyC: { background: "#fff0f0", color: "#c0392b", border: "1px solid #f5c6c6" },
  keyDel: { background: "#fff8f0", color: "#c07800", border: "1px solid #f5dfa0", fontSize: 18 },
  comment: { width: "100%", borderRadius: 8, border: "1px solid #ddd", padding: "8px 10px", fontSize: 14, resize: "none", marginBottom: 12, fontFamily: "inherit", boxSizing: "border-box" },
  btnRow: { display: "flex", gap: 10 },
  btnCancel: { flex: 1, padding: "13px 0", borderRadius: 10, border: "1px solid #ddd", background: "#f5f5f5", fontSize: 15, cursor: "pointer", fontWeight: 600 },
  btnConfirm: { flex: 2, padding: "13px 0", borderRadius: 10, border: "none", background: "#1a3a6b", color: "#fff", fontSize: 15, cursor: "pointer", fontWeight: 700 },
};

// --- Composant ligne ---
interface LigneRowProps {
  ligne: Ligne; saisieAveugle: boolean;
  highlighted: boolean; saving: boolean; readonly: boolean;
  onTap: () => void; onPhoto: () => void;
  ref_: React.MutableRefObject<Map<number, HTMLDivElement>>;
}

function LigneRow({ ligne: l, saisieAveugle, highlighted, saving, readonly, onTap, onPhoto, ref_ }: LigneRowProps) {
  const touchStartY = useRef(0);
  const touchMoved = useRef(false);

  const ecart = l.quantite_attendue !== null && l.quantite_recue !== null
    ? l.quantite_recue - l.quantite_attendue : null;
  const statusColor = l.quantite_recue === null ? "#aaa"
    : ecart === 0 ? "#27ae60" : ecart! < 0 ? "#c0392b" : "#e67e22";

  return (
    <div
      ref={(el) => el ? ref_.current.set(l.id, el) : ref_.current.delete(l.id)}
      style={{ ...styles.ligneCard, borderLeftColor: statusColor, background: highlighted ? "#fffbe6" : "#fff", transition: "background .4s" }}
      onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; touchMoved.current = false; }}
      onTouchMove={(e) => { if (Math.abs(e.touches[0].clientY - touchStartY.current) > 8) touchMoved.current = true; }}
      onTouchEnd={(e) => { if (!touchMoved.current && !readonly) { e.preventDefault(); onTap(); } }}
      onClick={() => { if (!readonly) onTap(); }}
    >
      <div style={styles.ligneHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={styles.refTag}>{l.reference_interne}</span>
          {l.reference_fournisseur && <span style={styles.refFourn}> · {l.reference_fournisseur}</span>}
          {l.ajout_hors_commande && <span style={styles.tagHC}>HORS COMMANDE</span>}
        </div>
        <div style={styles.ligneActions}>
          <button
            style={styles.iconBtn}
            onTouchEnd={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); onPhoto(); }}
            title="Photos"
          >
            📷{l.photos.length > 0 && <sup style={styles.photoBadge}>{l.photos.length}</sup>}
          </button>
        </div>
      </div>

      <div style={styles.designation}>{l.designation}</div>

      <div style={styles.qtysRow}>
        {!saisieAveugle && l.quantite_attendue !== null && (
          <div style={styles.qtyBox}>
            <div style={styles.qtyLabel}>Attendu</div>
            <div style={styles.qtyValue}>{l.quantite_attendue}</div>
          </div>
        )}
        <div style={{ ...styles.qtyBox, flex: 1 }}>
          <div style={styles.qtyLabel}>Reçu</div>
          <div style={{ ...styles.qtyValue, color: statusColor, fontSize: l.quantite_recue === null ? 14 : 22 }}>
            {l.quantite_recue ?? <span style={{ color: "#bbb", fontStyle: "italic" }}>appuyer pour saisir</span>}
          </div>
        </div>
        {ecart !== null && (
          <div style={styles.qtyBox}>
            <div style={styles.qtyLabel}>Écart</div>
            <div style={{ ...styles.qtyValue, color: statusColor, fontWeight: 700 }}>{ecart > 0 ? `+${ecart}` : ecart}</div>
          </div>
        )}
        {saving && <div style={styles.savingDot}>↑</div>}
      </div>

      {l.commentaire && <div style={styles.commentReadonly}>💬 {l.commentaire}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  recapCard: { background: "#fff", borderRadius: 12, padding: "12px 14px", marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,.08)" },
  fournisseur: { fontWeight: 700, fontSize: 16, marginBottom: 4 },
  metaRow: { display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" },
  tagAveugle: { background: "#8e44ad", color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 },
  metaItem: { fontSize: 13, color: "#555" },
  progressBar: { height: 6, background: "#e0e0e0", borderRadius: 4, overflow: "hidden", marginBottom: 0 },
  progressFill: { height: "100%", background: "#27ae60", borderRadius: 4, transition: "width .4s" },
  toggleRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid #f0f0f0" },
  toggleLabel: { fontSize: 13, fontWeight: 600, color: "#444" },
  toggle: { width: 48, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0 },
  toggleKnob: { position: "absolute", top: 2, width: 22, height: 22, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.3)", transition: "transform .2s" },
  actionsRow: { display: "flex", gap: 8, marginBottom: 10 },
  btnCamera: { flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #ccc", background: "#f0f4f8", cursor: "pointer", fontSize: 14, fontWeight: 600 },
  btnSearch: { flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #ccc", background: "#f0f4f8", cursor: "pointer", fontSize: 14, fontWeight: 600 },
  btnHorsCommande: { flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid #f39c12", background: "#fff9f0", color: "#c07800", cursor: "pointer", fontSize: 13, fontWeight: 600 },
  errorBanner: { background: "#fde8e8", color: "#c0392b", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 14 },
  lignesList: { display: "flex", flexDirection: "column", gap: 8, paddingBottom: 80 },
  ligneCard: { background: "#fff", borderRadius: 12, padding: "12px 14px", borderLeft: "5px solid #aaa", boxShadow: "0 1px 3px rgba(0,0,0,.08)", cursor: "pointer", userSelect: "none", WebkitTapHighlightColor: "transparent", touchAction: "pan-y" },
  ligneHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  refTag: { fontWeight: 700, fontSize: 12, color: "#1a3a6b", background: "#eef2ff", padding: "2px 6px", borderRadius: 5 },
  refFourn: { fontSize: 11, color: "#888" },
  tagHC: { background: "#f39c12", color: "#fff", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontWeight: 700, marginLeft: 6 },
  ligneActions: { display: "flex", gap: 4 },
  iconBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: "2px 4px", position: "relative" },
  photoBadge: { background: "#c0392b", color: "#fff", borderRadius: "50%", fontSize: 10, padding: "1px 3px", position: "absolute", top: -2, right: -2 },
  designation: { fontSize: 14, color: "#333", marginBottom: 8, lineHeight: 1.3 },
  qtysRow: { display: "flex", gap: 10, alignItems: "center" },
  qtyBox: { display: "flex", flexDirection: "column", alignItems: "center", minWidth: 60 },
  qtyLabel: { fontSize: 10, color: "#aaa", textTransform: "uppercase", marginBottom: 3, letterSpacing: 0.5 },
  qtyValue: { fontSize: 22, fontWeight: 700, lineHeight: 1 },
  savingDot: { color: "#888", fontSize: 20 },
  commentReadonly: { fontSize: 12, color: "#888", marginTop: 4 },
  terminerBar: { position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px", background: "#fff", boxShadow: "0 -2px 8px rgba(0,0,0,.12)", zIndex: 50 },
  terminerBtn: { width: "100%", padding: 16, background: "#1a3a6b", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer" },
  preteBar: { textAlign: "center", padding: "16px", color: "#27ae60", fontWeight: 700, fontSize: 16 },
  photoModalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 700 },
  photoModal: { background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 500 },
  photoModalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 16px 12px", borderBottom: "1px solid #eee" },
};
