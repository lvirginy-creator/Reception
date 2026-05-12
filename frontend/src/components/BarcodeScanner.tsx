/**
 * Gestion du scan code-barres :
 * - Douchette HID : input caché global qui capte les caractères rapides (< 50 ms entre chaque)
 * - Caméra de secours : @zxing/browser BrowserMultiFormatReader
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  active?: boolean;
}

// --- Douchette HID ---
// Accumule les chars rapides (< 80 ms d'écart) et déclenche onScan sur Enter
export function useBarcodeInput(onScan: (code: string) => void, active = true) {
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;

    const handleKey = (e: KeyboardEvent) => {
      // Ignorer si le focus est sur un input/textarea (sauf input[data-barcode])
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
        // Si le buffer n'est pas suivi d'un Enter dans 150 ms, on l'ignore
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
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [error, setError] = useState("");
  const scanned = useRef(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    scanned.current = false;

    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const deviceId = devices.find((d) =>
          d.label.toLowerCase().includes("back") || d.label.toLowerCase().includes("rear")
        )?.deviceId ?? devices[0]?.deviceId;

        if (!deviceId) { setError("Aucune caméra détectée"); return; }

        await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current!,
          (result, err) => {
            if (result && !scanned.current) {
              scanned.current = true;
              onScan(result.getText());
              onClose();
            }
          }
        );
      } catch (e: any) {
        setError(e.message ?? "Erreur caméra");
      }
    })();

    return () => {
      readerRef.current?.reset();
    };
  }, []);

  return (
    <div style={styles.overlay}>
      <div style={styles.cameraCard}>
        <div style={styles.cameraHeader}>
          <span style={{ fontWeight: 700 }}>Scanner avec la caméra</span>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        {error ? (
          <div style={styles.camError}>{error}</div>
        ) : (
          <video ref={videoRef} style={styles.video} autoPlay muted playsInline />
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
  video: { width: "100%", maxHeight: "60vh", background: "#000", display: "block" },
  cameraHint: { padding: 12, textAlign: "center", color: "#555", fontSize: 13 },
  camError: { padding: 24, color: "#c0392b", textAlign: "center" },
};
