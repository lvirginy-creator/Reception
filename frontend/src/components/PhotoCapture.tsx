import { useRef, useState } from "react";
import type { Photo } from "../api/receptions";

interface Props {
  photos: Photo[];
  onUpload: (file: File) => Promise<void>;
  readonly?: boolean;
}

const MAX_BYTES = 1_000_000;

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1024;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file);
        },
        "image/jpeg",
        0.82
      );
    };
    img.src = url;
  });
}

export default function PhotoCapture({ photos, onUpload, readonly }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<Photo | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const compressed = await compressImage(file);
      if (compressed.size > MAX_BYTES * 5) {
        setError("Photo trop volumineuse après compression");
        return;
      }
      await onUpload(compressed);
    } catch {
      setError("Erreur lors de l'upload");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <>
      <div style={styles.container}>
        {photos.map((p) => (
          <div
            key={p.id}
            style={styles.thumb}
            onClick={() => setLightbox(p)}
            title="Agrandir"
          >
            <img
              src={`/api/storage/photos/${p.chemin_fichier}`}
              alt="Photo réception"
              style={styles.img}
            />
            <div style={styles.zoomHint}>🔍</div>
            {p.commentaire && <div style={styles.caption}>{p.commentaire}</div>}
          </div>
        ))}

        {!readonly && (
          <>
            <button
              style={{ ...styles.addBtn, opacity: uploading ? 0.6 : 1 }}
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              title="Ajouter une photo"
            >
              {uploading ? "⏳" : "📷"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={handleFile}
            />
          </>
        )}
        {error && <span style={styles.error}>{error}</span>}
      </div>

      {/* Lightbox plein écran */}
      {lightbox && (
        <div style={styles.overlay} onClick={() => setLightbox(null)}>
          <button style={styles.closeBtn} onClick={() => setLightbox(null)}>✕</button>

          {/* Navigation précédent / suivant */}
          {photos.length > 1 && (() => {
            const idx = photos.findIndex((p) => p.id === lightbox.id);
            const prev = photos[idx - 1];
            const next = photos[idx + 1];
            return (
              <>
                {prev && (
                  <button
                    style={{ ...styles.navBtn, left: 12 }}
                    onClick={(e) => { e.stopPropagation(); setLightbox(prev); }}
                  >
                    ‹
                  </button>
                )}
                {next && (
                  <button
                    style={{ ...styles.navBtn, right: 12 }}
                    onClick={(e) => { e.stopPropagation(); setLightbox(next); }}
                  >
                    ›
                  </button>
                )}
              </>
            );
          })()}

          <img
            src={`/api/storage/photos/${lightbox.chemin_fichier}`}
            alt="Photo plein écran"
            style={styles.fullImg}
            onClick={(e) => e.stopPropagation()}
          />

          {lightbox.commentaire && (
            <div style={styles.fullCaption}>{lightbox.commentaire}</div>
          )}

          {photos.length > 1 && (
            <div style={styles.counter}>
              {photos.findIndex((p) => p.id === lightbox.id) + 1} / {photos.length}
            </div>
          )}
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 6 },

  thumb: {
    position: "relative", cursor: "pointer",
    borderRadius: 8, overflow: "hidden",
    border: "1px solid #ddd",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  },
  img: { width: 80, height: 80, objectFit: "cover", display: "block" },
  zoomHint: {
    position: "absolute", bottom: 2, right: 4,
    fontSize: 12, opacity: 0.7, pointerEvents: "none",
  },
  caption: {
    fontSize: 10, color: "#555", textAlign: "center",
    maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis",
    whiteSpace: "nowrap", padding: "2px 4px", background: "rgba(0,0,0,.04)",
  },

  addBtn: {
    width: 80, height: 80, borderRadius: 8, border: "2px dashed #bbb",
    background: "#f8f8f8", fontSize: 24, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    touchAction: "manipulation",
  },
  error: { color: "#c0392b", fontSize: 12 },

  // Lightbox
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,.92)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1100,
    flexDirection: "column",
  },
  fullImg: {
    maxWidth: "95vw", maxHeight: "80vh",
    objectFit: "contain",
    borderRadius: 8,
    boxShadow: "0 4px 32px rgba(0,0,0,.6)",
  },
  closeBtn: {
    position: "absolute", top: 16, right: 16,
    background: "rgba(255,255,255,.15)", border: "none",
    color: "#fff", fontSize: 24, width: 40, height: 40,
    borderRadius: "50%", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  navBtn: {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    background: "rgba(255,255,255,.15)", border: "none",
    color: "#fff", fontSize: 36, width: 44, height: 64,
    borderRadius: 8, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    touchAction: "manipulation",
  },
  fullCaption: {
    color: "#ddd", fontSize: 14, marginTop: 12,
    maxWidth: "80vw", textAlign: "center",
  },
  counter: {
    position: "absolute", bottom: 20,
    color: "rgba(255,255,255,.6)", fontSize: 13,
  },
};
