/**
 * Gestion du scan code-barres :
 * - Douchette HID : input caché global qui capte les caractères rapides (< 80 ms entre chaque)
 * - Caméra : @zxing/browser BrowserMultiFormatReader via decodeFromConstraints
 */
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

// --- Douchette HID ---
export function useBarcodeInput(onScan: (code: string) => void, active = true) {
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;

    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isBarcode = target.dataset["barcode"] === "true";
      if (!isBarcode && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
        return;
      }

      if (e.key === "Enter") {
        const code = bufferRef.current.trim();
        if (code.length >= 3) onScan(code);
        bufferRef.current = "";
        if (timerRef.current) clearTimeout(timerRef.current);
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { bufferRef.current = ""; }, 150);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [active, onScan]);
}

// --- Caméra @zxing ---
export function CameraScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"init" | "ready" | "error">("init");
  const scanned = useRef(false);

  useEffect(() => {
    scanned.current = false;
    let cancelled = false;

    (async () => {
      try {
        // 1. Demander la permission caméra explicitement.
        //    Sans ça, listVideoInputDevices() retourne [] sur Android.
        await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });

        if (cancelled) return;

        // 2. Lancer le décodage directement avec la contrainte caméra arrière.
        //    decodeFromConstraints gère le flux vidéo en interne.
        const reader = new BrowserMultiFormatReader();
        setStatus("ready");

        controlsRef.current = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result, err) => {
            if (result && !scanned.current) {
              scanned.current = true;
              controlsRef.current?.stop();
              onScan(result.getText());
              onClose();
            }
            // Ignorer les erreurs de décodage continues (pas de QR dans le champ)
            if (err && !(err.message?.includes("No MultiFormat"))) {
              console.debug("zxing:", err.message);
            }
          }
        );
      } catch (e: any) {
        if (cancelled) return;
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          setError("Permission caméra refusée. Autorisez l'accès dans les paramètres du navigateur.");
        } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
          setError("Aucune caméra détectée sur cet appareil.");
        } else if (e.name === "NotReadableError") {
          setError("Caméra occupée par une autre application.");
        } else {
          setError(e.message ?? "Erreur caméra inconnue");
        }
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, []);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.cameraCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.cameraHeader}>
          <span style={{ fontWeight: 700 }}>Scanner avec la caméra</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {status === "init" && !error && (
          <div style={styles.camStatus}>Ouverture de la caméra…</div>
        )}

        {error ? (
          <div style={styles.camError}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
            <div>{error}</div>
            {error.includes("paramètres") && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#888" }}>
                Chrome : Menu → Paramètres du site → Caméra → Autoriser
              </div>
            )}
          </div>
        ) : (
          <video
            ref={videoRef}
            style={{ ...styles.video, display: status === "ready" ? "block" : "none" }}
            autoPlay
            muted
            playsInline
          />
        )}

        <div style={styles.cameraHint}>Pointez la caméra vers le code-barres</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,.7)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
  },
  cameraCard: {
    background: "#fff", borderRadius: 16, overflow: "hidden",
    width: "min(400px, 95vw)",
  },
  cameraHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 16px", background: "#1a3a6b", color: "#fff",
  },
  closeBtn: {
    background: "transparent", border: "none", color: "#fff",
    fontSize: 20, cursor: "pointer", lineHeight: 1,
  },
  video: { width: "100%", maxHeight: "60vh", background: "#000" },
  camStatus: { padding: 32, textAlign: "center", color: "#888", fontSize: 14 },
  cameraHint: { padding: 12, textAlign: "center", color: "#555", fontSize: 13 },
  camError: { padding: 24, color: "#c0392b", textAlign: "center", lineHeight: 1.5 },
};
