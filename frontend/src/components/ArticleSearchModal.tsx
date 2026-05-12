/**
 * Modal de recherche d'article + association code-barres inconnu.
 * Déclenché quand un scan retourne un code inconnu ou que l'utilisateur
 * clique sur "Recherche manuelle".
 */
import { useEffect, useRef, useState } from "react";
import { articlesApi, type Article } from "../api/articles";

interface Props {
  unknownBarcode?: string;           // code-barres inconnu à associer
  onSelect: (article: Article, barcode?: string) => void;
  onClose: () => void;
  title?: string;
}

export default function ArticleSearchModal({ unknownBarcode, onSelect, onClose, title }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [associating, setAssociating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const items = await articlesApi.search(query);
        setResults(items);
      } catch {}
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handleSelect = async (article: Article) => {
    if (unknownBarcode) {
      setAssociating(true);
      try {
        await articlesApi.associateBarcode(article.id, unknownBarcode);
        onSelect(article, unknownBarcode);
      } catch (e: any) {
        alert(e.response?.data?.detail ?? "Erreur lors de l'association");
      } finally {
        setAssociating(false);
      }
    } else {
      onSelect(article);
    }
  };

  return (
    <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div>
            <div style={styles.headerTitle}>{title ?? (unknownBarcode ? "Code-barres inconnu" : "Recherche article")}</div>
            {unknownBarcode && (
              <div style={styles.headerSub}>Code : <code>{unknownBarcode}</code> — Choisissez l'article associé</div>
            )}
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.body}>
          <input
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Réf, désignation, réf fournisseur…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />

          {loading && <div style={styles.hint}>Recherche…</div>}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div style={styles.hint}>Aucun article trouvé</div>
          )}
          {query.length < 2 && <div style={styles.hint}>Saisissez au moins 2 caractères</div>}

          <div style={styles.list}>
            {results.map((a) => (
              <button
                key={a.id}
                style={styles.articleRow}
                onClick={() => handleSelect(a)}
                disabled={associating}
              >
                <span style={styles.ref}>{a.reference_interne}</span>
                <span style={styles.desig}>{a.designation}</span>
              </button>
            ))}
          </div>
        </div>

        {unknownBarcode && (
          <div style={styles.footer}>
            <span style={{ fontSize: 12, color: "#888" }}>
              L'association sera enregistrée et ce code reconnu pour les prochaines réceptions.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
    display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 500,
  },
  modal: {
    background: "#fff", borderRadius: "16px 16px 0 0",
    width: "100%", maxWidth: 600, maxHeight: "85vh",
    display: "flex", flexDirection: "column",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    padding: "16px 16px 12px", borderBottom: "1px solid #eee",
  },
  headerTitle: { fontWeight: 700, fontSize: 16 },
  headerSub: { fontSize: 12, color: "#666", marginTop: 4 },
  closeBtn: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#888", lineHeight: 1 },
  body: { flex: 1, overflowY: "auto", padding: "12px 16px" },
  searchInput: {
    width: "100%", padding: "12px 12px", borderRadius: 10,
    border: "2px solid #1a3a6b", fontSize: 16, marginBottom: 10,
    boxSizing: "border-box",
  },
  hint: { textAlign: "center", color: "#aaa", padding: "20px 0", fontSize: 14 },
  list: { display: "flex", flexDirection: "column", gap: 6 },
  articleRow: {
    display: "flex", flexDirection: "column", alignItems: "flex-start",
    padding: "12px 14px", borderRadius: 10, border: "1px solid #e0e0e0",
    background: "#f8f9fc", cursor: "pointer", textAlign: "left",
    gap: 3,
  },
  ref: { fontWeight: 700, fontSize: 13, color: "#1a3a6b" },
  desig: { fontSize: 14, color: "#333" },
  footer: { padding: "10px 16px 16px", borderTop: "1px solid #eee" },
};
