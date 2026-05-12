import { useRef, useState } from "react";
import type { Photo } from "../api/receptions";

interface Props {
  photos: Photo[];
  onUpload: (file: File) => Promise<void>;
  readonly?: boolean;
}

const MAX_BYTES = 1_000_000; // 1 Mo (compression côté client)

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
    <div style={styles.container}>
      {photos.map((p) => (
        <div key={p.id} style={styles.thumb}>
          <img
            src={`/api/storage/photos/${p.chemin_fichier}`}
            alt="Photo réception"
            style={styles.img}
            loading="lazy"
          />
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
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 6 },
  thumb: { position: "relative" },
  img: { width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #ddd" },
  caption: { fontSize: 10, color: "#888", textAlign: "center", maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  addBtn: {
    width: 64, height: 64, borderRadius: 8, border: "2px dashed #bbb",
    background: "#f8f8f8", fontSize: 24, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  error: { color: "#c0392b", fontSize: 12 },
};
