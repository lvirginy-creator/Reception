import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginPin } from "../api/auth";
import { useAuthStore } from "../store/authStore";
import { db } from "../db/database";
import { api } from "../api/client";

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "⌫"];

export default function Login() {
  const [magasinCode, setMagasinCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const handleDigit = (d: number | "⌫" | null) => {
    if (d === null) return;
    if (d === "⌫") setPin((p) => p.slice(0, -1));
    else if (pin.length < 6) setPin((p) => p + d);
  };

  const handleSubmitPin = async () => {
    if (!magasinCode.trim()) { setError("Veuillez saisir le code magasin"); return; }
    if (pin.length < 4) { setError("PIN trop court (4 à 6 chiffres)"); return; }
    setLoading(true);
    setError("");
    try {
      const user = await loginPin(magasinCode.trim().toUpperCase(), pin);
      login(user);
      try {
        const { data } = await api.get("/sync/pull");
        const now = Date.now();
        await db.receptions.bulkPut(
          data.receptions.map((r: any) => ({ ...r, synced_at: now }))
        );
      } catch {}
      navigate("/receptions");
    } catch (e: any) {
      setError(e.response?.data?.detail || "Connexion impossible");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAdmin = async () => {
    if (!username.trim()) { setError("Veuillez saisir le login"); return; }
    if (!password.trim()) { setError("Veuillez saisir le mot de passe"); return; }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", { username, password });
      login(data);
      navigate("/admin");
    } catch (e: any) {
      setError(e.response?.data?.detail || "Identifiants incorrects");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Validation Réceptions</h1>

        {!adminMode ? (
          <>
            <label style={styles.label}>Code magasin</label>
            <input
              style={styles.input}
              value={magasinCode}
              onChange={(e) => setMagasinCode(e.target.value.toUpperCase())}
              placeholder="ex : PAP"
              autoComplete="off"
              autoCapitalize="characters"
            />

            <label style={styles.label}>PIN</label>
            <div style={styles.pinDisplay}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ ...styles.pinDot, background: i < pin.length ? "#1a3a6b" : "#ddd" }} />
              ))}
            </div>

            <div style={styles.keypad}>
              {DIGITS.map((d, i) => (
                <button
                  key={i}
                  style={{ ...styles.key, ...(d === null ? styles.keyEmpty : {}) }}
                  onClick={() => handleDigit(d as any)}
                  disabled={d === null || loading}
                >
                  {d}
                </button>
              ))}
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button
              style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
              onClick={handleSubmitPin}
              disabled={loading || pin.length < 4}
            >
              {loading ? "Connexion…" : "Se connecter"}
            </button>

            <button style={styles.adminLink} onClick={() => { setAdminMode(true); setError(""); }}>
              Connexion administrateur
            </button>
          </>
        ) : (
          <>
            <label style={styles.label}>Login</label>
            <input
              style={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
            />

            <label style={styles.label}>Mot de passe</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && handleSubmitAdmin()}
            />

            {error && <p style={styles.error}>{error}</p>}

            <button
              style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
              onClick={handleSubmitAdmin}
              disabled={loading}
            >
              {loading ? "Connexion…" : "Se connecter"}
            </button>

            <button style={styles.adminLink} onClick={() => { setAdminMode(false); setError(""); }}>
              ← Retour connexion PIN
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f4f8" },
  card: { background: "#fff", borderRadius: 16, padding: "32px 28px", width: 340, boxShadow: "0 4px 20px rgba(0,0,0,.12)" },
  title: { textAlign: "center", color: "#1a3a6b", fontSize: 20, marginBottom: 24 },
  label: { display: "block", fontWeight: 600, marginBottom: 6, color: "#444" },
  input: { width: "100%", padding: "12px 10px", borderRadius: 8, border: "1px solid #ccc", fontSize: 18, marginBottom: 20, boxSizing: "border-box" },
  pinDisplay: { display: "flex", gap: 10, justifyContent: "center", marginBottom: 16 },
  pinDot: { width: 18, height: 18, borderRadius: "50%", transition: "background .15s" },
  keypad: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 },
  key: { padding: "18px 0", fontSize: 22, fontWeight: 600, border: "1px solid #ddd", borderRadius: 10, background: "#f7f9fc", cursor: "pointer", touchAction: "manipulation" },
  keyEmpty: { background: "transparent", border: "none", cursor: "default" },
  error: { color: "#c0392b", textAlign: "center", marginBottom: 10, fontSize: 14 },
  submitBtn: { width: "100%", padding: 16, background: "#1a3a6b", color: "#fff", border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer" },
  adminLink: { width: "100%", marginTop: 12, padding: "10px 0", background: "transparent", border: "none", color: "#888", fontSize: 13, cursor: "pointer", textDecoration: "underline" },
};
