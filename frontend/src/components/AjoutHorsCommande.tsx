import { useState } from "react";
import type { Article } from "../api/articles";

interface Props {
  onAdd: (data: { reference_interne: string; designation: string; article_id?: number; quantite_recue?: number }) => Promise<void>;
  onClose: () => void;
  prefill?: { article: Article; barcode: string };
}

export default function AjoutHorsCommande({ onAdd, onClose, prefill }: Props) {
  const [ref, setRef] = useState(prefill?.article.reference_interne ?? "");
  const [desig, setDesig] = useState(prefill?.article.designation ?? "");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!ref.trim()) { setError("Référence obligatoire"); return; }
    if (!desig.trim()) { setError("Désignation obligatoire"); return; }
    setSaving(true);
    try {
      await onAdd({
        reference_interne: ref.trim(),
        designation: desig.trim(),
        article_id: prefill?.article.id,
        quantite_recue: qty !== "" ? parseInt(qty, 10) : undefined,
      });
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Ajout hors commande</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.body}>
          <label style={styles.label}>Référence interne *</label>
          <input
            style={styles.input}
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="ex : ART001"
            autoCapitalize="characters"
          />

          <label style={styles.label}>Désignation *</label>
          <input
            style={styles.input}
            value={desig}
            onChange={(e) => setDesig(e.target.value)}
            placeholder="Nom du produit"
          />

          <label style={styles.label}>Quantité reçue</label>
          <input
            style={styles.input}
            type="number"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            inputMode="numeric"
          />

          {prefill && (
            <div style={styles.info}>
              Code-barres associé : <code>{prefill.barcode}</code>
            </div>
          )}

          {error && <div style={styles.error}>{error}</div>}

          <button
            style={{ ...styles.submitBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "Enregistrement…" : "Ajouter la ligne"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
    display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 600,
  },
  modal: {
    background: "#fff", borderRadius: "16px 16px 0 0",
    width: "100%", maxWidth: 500,
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 16px 12px", borderBottom: "1px solid #eee",
  },
  closeBtn: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#888" },
  body: { padding: "14px 16px 24px", display: "flex", flexDirection: "column", gap: 10 },
  label: { fontWeight: 600, fontSize: 13, color: "#444", marginBottom: -6 },
  input: {
    padding: "12px 12px", borderRadius: 10, border: "1px solid #ccc",
    fontSize: 16, boxSizing: "border-box" as const, width: "100%",
  },
  info: { fontSize: 12, color: "#888", background: "#f8f8f8", padding: "6px 10px", borderRadius: 8 },
  error: { color: "#c0392b", fontSize: 13 },
  submitBtn: {
    padding: "14px", background: "#f39c12", color: "#fff",
    border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700,
    cursor: "pointer", marginTop: 6,
  },
};
