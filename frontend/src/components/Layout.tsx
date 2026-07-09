import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { logout } from "../api/auth";
import SyncIndicator from "./SyncIndicator";
import { useSync } from "../hooks/useSync";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  backTo?: string;
}

export default function Layout({ children, title, backTo }: LayoutProps) {
  const user = useAuthStore((s) => s.user);
  const logoutStore = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  useSync();

  const handleLogout = async () => {
    await logout();
    logoutStore();
    navigate("/login");
  };

  return (
    <div style={styles.root}>
      {/* Bandeau magasin permanent */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          {backTo && (
            <button style={styles.backBtn} onClick={() => navigate(backTo)}>‹</button>
          )}
          <div>
            <div style={styles.magasinNom}>{user?.magasin_nom ?? "Administration"}</div>
            <div style={styles.userInfo}>
              {user?.prenom} {user?.nom} · {roleLabel(user?.role)}
            </div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <SyncIndicator />
          <button style={styles.adminBtn} onClick={() => navigate("/historique")}>
            📋 Historique
          </button>
          {user?.role === "admin" && (
            <button style={styles.adminBtn} onClick={() => navigate("/admin")}>
              ⚙ Admin
            </button>
          )}
          <button style={styles.logoutBtn} onClick={handleLogout}>Déconnexion</button>
        </div>
      </header>

      {title && <div style={styles.pageTitle}>{title}</div>}
      <main style={styles.main}>{children}</main>
    </div>
  );
}

function roleLabel(role?: string) {
  const labels: Record<string, string> = {
    magasinier: "Magasinier",
    responsable: "Responsable",
    achats: "Service achats",
    admin: "Administrateur",
  };
  return labels[role ?? ""] ?? role ?? "";
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f0f4f8" },
  header: {
    background: "#1a3a6b", color: "#fff",
    padding: "10px 16px", display: "flex",
    alignItems: "center", justifyContent: "space-between",
    position: "sticky", top: 0, zIndex: 100,
    boxShadow: "0 2px 6px rgba(0,0,0,.3)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  headerRight: { display: "flex", alignItems: "center", gap: 14 },
  backBtn: {
    background: "rgba(255,255,255,.2)", border: "none", color: "#fff",
    fontSize: 24, borderRadius: 8, padding: "4px 12px", cursor: "pointer",
    lineHeight: 1,
  },
  magasinNom: { fontWeight: 700, fontSize: 16 },
  userInfo: { fontSize: 11, opacity: 0.8, marginTop: 2 },
  adminBtn: {
    background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)",
    color: "#fff", padding: "6px 12px", borderRadius: 8, cursor: "pointer",
    fontSize: 13,
  },
  logoutBtn: {
    background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)",
    color: "#fff", padding: "6px 12px", borderRadius: 8, cursor: "pointer",
    fontSize: 13,
  },
  pageTitle: {
    padding: "12px 16px 0", fontSize: 18, fontWeight: 700, color: "#1a3a6b",
  },
  main: { flex: 1, padding: "12px 16px 80px" },
};
