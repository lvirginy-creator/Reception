import { useEffect, useRef, useState } from "react";
import { articlesApi, type Article } from "../api/articles";

interface LocalLine {
  id: number;
  article_id: number | null;
  reference_interne: string;
  reference_fournisseur: string | null;
  designation: string;
}

interface Props {
  unknownBarcode?: string;
  localLines?: LocalLine[];
  onSelect: (article: Article, barcode?: string) => void;
  onClose: () => void;
  title?: string;
}

function matchesQuery(line: LocalLine, q: string): boolean {
  const lq = q.toLowerCase();
  return (
    line.reference_interne.toLowerCase().includes(lq) ||
    (line.reference_fournisseur?.toLowerCase().includes(lq) ?? false) ||
    line.designation.toLowerCase().includes(lq)
  );
}

export default function ArticleSearchModal({ unknownBarcode, localLines, onSelect, onClose, title }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [associating, setAssociating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Lignes de la réception courante correspondant à la recherche
  const localMatches =
    query.length >= 2 && localLines
      ? localLines.filter((l) => matchesQuery(l, query))
      : [];

  // Références internes déjà couvertes par les résultats locaux
  const localRefs = new Set(localMatches.map((l) => l.reference_interne));

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const items = await articlesApi.search(query);
        // Exclure ceux déjà affichés via localMatches
        setResults(items.filter((a) => !localRefs.has(a.reference_interne)));
      } catch {}
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const handleSelectLocal = async (line: LocalLine) => {
    const article: Article = {
      id: line.article_id ?? 0,
      reference_interne: line.reference_interne,
      designation: line.designation,
    };
    if (unknownBarcode && line.article_id) {
      setAssociating(true);
      try {
        await articlesApi.associateBarcode(line.article_id, unknownBarcode);
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

  const handleSelectApi = async (article: Article) => {
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

  const noResults = query.length >= 2 && !loading && localMatches.length === 0 && results.length === 0;

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

          {query.length < 2 && <div style={styles.hint}>Saisissez au moins 2 caractères</div>}
          {loading && <div style={styles.hint}>Recherche…</div>}
          {noResults && <div style={styles.hint}>Aucun article trouvé</div>}

          {/* Résultats dans la réception courante */}
          {localMatches.length > 0 && (
            <>
              <div style={styles.sectionLabel}>Dans cette réception</div>
              <div style={styles.list}>
                {localMatches.map((line) => (
                  <button
                    key={line.id}
                    style={styles.articleRow}
                    onClick={() => handleSelectLocal(line)}
                    disabled={associating}
                  >
                    <div style={styles.rowTop}>
                      <span style={styles.ref}>{line.reference_interne}</span>
                      {line.reference_fournisseur && (
                        <span style={styles.refFourn}>{line.reference_fournisseur}</span>
                      )}
                    </div>
                    <span style={styles.desig}>{line.designation}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Résultats du catalogue général */}
          {results.length > 0 && (
            <>
              {localMatches.length > 0 && <div style={styles.sectionLabel}>Catalogue</div>}
              <div style={styles.list}>
                {results.map((a) => (
                  <button
                    key={a.id}
                    style={styles.articleRow}
                    onClick={() => handleSelectApi(a)}
                    disabled={associating}
                  >
                    <span style={styles.ref}>{a.reference_interne}</span>
                    <span style={styles.desig}>{a.designation}</span>
                  </button>
                ))}
              </div>
            </>
          )}
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
  sectionLabel: {
    fontSize: 11, fontWeight: 700, color: "#1a3a6b", textTransform: "uppercase",
    letterSpacing: 0.8, marginBottom: 6, marginTop: 4,
  },
  list: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 },
  articleRow: {
    display: "flex", flexDirection: "column", alignItems: "flex-start",
    padding: "12px 14px", borderRadius: 10, border: "1px solid #e0e0e0",
    background: "#f8f9fc", cursor: "pointer", textAlign: "left",
    gap: 3,
  },
  rowTop: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  ref: { fontWeight: 700, fontSize: 13, color: "#1a3a6b" },
  refFourn: { fontSize: 12, color: "#888", background: "#f0f0f0", borderRadius: 4, padding: "1px 6px" },
  desig: { fontSize: 14, color: "#333" },
  footer: { padding: "10px 16px 16px", borderTop: "1px solid #eee" },
};
