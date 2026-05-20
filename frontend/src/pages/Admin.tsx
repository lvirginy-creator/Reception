import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { adminApi, Societe, Magasin, Utilisateur, UtilisateurCreate } from "../api/admin";
import { useAuthStore } from "../store/authStore";

type Tab = "societes" | "magasins" | "utilisateurs";

const ROLE_LABELS: Record<string, string> = {
  magasinier: "Magasinier",
  responsable: "Responsable",
  achats: "Achats",
  admin: "Admin",
};

const ROLE_COLORS: Record<string, string> = {
  magasinier: "#2ecc71",
  responsable: "#8e44ad",
  achats: "#e67e22",
  admin: "#c0392b",
};

// ─── Modal générique ────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: "16px",
    }}>
      <div style={{
        background: "#fff", borderRadius: "12px", padding: "24px",
        width: "100%", maxWidth: "480px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#666",
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Champ formulaire ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#555", marginBottom: "6px" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid #ddd",
  borderRadius: "8px", fontSize: "15px", boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = { ...inputStyle, background: "#fff" };

// ─── Boutons ────────────────────────────────────────────────────────────────

function BtnPrimary({ onClick, disabled, children }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? "#aaa" : "#2980b9", color: "#fff", border: "none",
      borderRadius: "8px", padding: "10px 20px", fontSize: "15px", fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer", minWidth: "100px",
    }}>{children}</button>
  );
}

function BtnDanger({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      background: "#c0392b", color: "#fff", border: "none",
      borderRadius: "6px", padding: "6px 14px", fontSize: "13px",
      cursor: "pointer",
    }}>{children}</button>
  );
}

function BtnSecondary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      background: "#f0f0f0", color: "#333", border: "none",
      borderRadius: "6px", padding: "6px 14px", fontSize: "13px",
      cursor: "pointer",
    }}>{children}</button>
  );
}

// ─── Onglet Sociétés ─────────────────────────────────────────────────────────

function SocietesTab({ societes, refresh }: { societes: Societe[]; refresh: () => void }) {
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Societe | null>(null);
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() { setNom(""); setCode(""); setEditing(null); setModal("create"); setError(""); }
  function openEdit(s: Societe) { setNom(s.nom); setCode(s.code); setEditing(s); setModal("edit"); setError(""); }
  function closeModal() { setModal(null); setEditing(null); }

  async function handleSave() {
    if (!nom.trim() || !code.trim()) { setError("Nom et code requis"); return; }
    setSaving(true); setError("");
    try {
      if (modal === "create") await adminApi.createSociete({ nom, code: code.toUpperCase() });
      else if (editing) await adminApi.updateSociete(editing.id, { nom, code: code.toUpperCase() });
      refresh(); closeModal();
    } catch { setError("Erreur lors de la sauvegarde"); }
    setSaving(false);
  }

  async function handleDelete(s: Societe) {
    if (!confirm(`Supprimer la société "${s.nom}" ? Cette action est irréversible.`)) return;
    try { await adminApi.deleteSociete(s.id); refresh(); }
    catch { alert("Impossible de supprimer (des magasins sont liés ?)"); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <span style={{ color: "#666" }}>{societes.length} société(s)</span>
        <BtnPrimary onClick={openCreate}>+ Nouvelle société</BtnPrimary>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {societes.map((s) => (
          <div key={s.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#fff", borderRadius: "8px", padding: "14px 16px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>{s.nom}</div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>Code : {s.code}</div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <BtnSecondary onClick={() => openEdit(s)}>Modifier</BtnSecondary>
              <BtnDanger onClick={() => handleDelete(s)}>Supprimer</BtnDanger>
            </div>
          </div>
        ))}
        {societes.length === 0 && (
          <div style={{ textAlign: "center", color: "#aaa", padding: "40px" }}>Aucune société</div>
        )}
      </div>

      {modal && (
        <Modal title={modal === "create" ? "Nouvelle société" : "Modifier la société"} onClose={closeModal}>
          <Field label="Nom de la société">
            <input style={inputStyle} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex: Groupe Caraïbes Distribution" />
          </Field>
          <Field label="Code (3 lettres)">
            <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="Ex: GCD" />
          </Field>
          {error && <div style={{ color: "#c0392b", marginBottom: "12px", fontSize: "14px" }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <BtnSecondary onClick={closeModal}>Annuler</BtnSecondary>
            <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "..." : "Enregistrer"}</BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Onglet Magasins ─────────────────────────────────────────────────────────

function MagasinsTab({ magasins, societes, refresh }: { magasins: Magasin[]; societes: Societe[]; refresh: () => void }) {
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Magasin | null>(null);
  const [nom, setNom] = useState("");
  const [code, setCode] = useState("");
  const [mailDestinataire, setMailDestinataire] = useState("");
  const [mailInput, setMailInput] = useState("");
  const [societeId, setSocieteId] = useState<number | "">(societes[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openCreate() {
    setNom(""); setCode(""); setMailDestinataire(""); setMailInput(""); setSocieteId(societes[0]?.id ?? "");
    setEditing(null); setModal("create"); setError("");
  }
  function openEdit(m: Magasin) {
    setNom(m.nom); setCode(m.code); setMailDestinataire(m.mail_destinataire ?? ""); setMailInput(""); setSocieteId(m.societe_id);
    setEditing(m); setModal("edit"); setError("");
  }
  function closeModal() { setModal(null); setEditing(null); }

  async function handleSave() {
    if (!nom.trim() || !code.trim() || !societeId) { setError("Tous les champs obligatoires"); return; }
    setSaving(true); setError("");
    try {
      const payload = { nom, code: code.toUpperCase(), societe_id: societeId as number, mail_destinataire: mailDestinataire || undefined };
      if (modal === "create") await adminApi.createMagasin(payload);
      else if (editing) await adminApi.updateMagasin(editing.id, payload);
      refresh(); closeModal();
    } catch { setError("Erreur lors de la sauvegarde"); }
    setSaving(false);
  }

  async function handleDelete(m: Magasin) {
    if (!confirm(`Supprimer le magasin "${m.nom}" ? Cette action est irréversible.`)) return;
    try { await adminApi.deleteMagasin(m.id); refresh(); }
    catch { alert("Impossible de supprimer (des utilisateurs ou réceptions sont liés ?)"); }
  }

  function getSocieteName(id: number) {
    return societes.find((s) => s.id === id)?.nom ?? "—";
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <span style={{ color: "#666" }}>{magasins.length} magasin(s)</span>
        <BtnPrimary onClick={openCreate}>+ Nouveau magasin</BtnPrimary>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {magasins.map((m) => (
          <div key={m.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#fff", borderRadius: "8px", padding: "14px 16px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>{m.nom}</div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                Code : {m.code} · {m.societe_nom ?? getSocieteName(m.societe_id)}
                {m.mail_destinataire && ` · ${m.mail_destinataire}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <BtnSecondary onClick={() => openEdit(m)}>Modifier</BtnSecondary>
              <BtnDanger onClick={() => handleDelete(m)}>Supprimer</BtnDanger>
            </div>
          </div>
        ))}
        {magasins.length === 0 && (
          <div style={{ textAlign: "center", color: "#aaa", padding: "40px" }}>Aucun magasin</div>
        )}
      </div>

      {modal && (
        <Modal title={modal === "create" ? "Nouveau magasin" : "Modifier le magasin"} onClose={closeModal}>
          <Field label="Société *">
            <select style={selectStyle} value={societeId} onChange={(e) => setSocieteId(Number(e.target.value))}>
              {societes.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </Field>
          <Field label="Nom du magasin *">
            <input style={inputStyle} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex: Pointe-à-Pitre Centre" />
          </Field>
          <Field label="Code (3 lettres) *">
            <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="Ex: PAP" />
          </Field>
          <Field label="E-mails magasin (optionnel)">
            <div style={{ border: "1px solid #ddd", borderRadius: "6px", padding: "6px 8px", background: "#fff", minHeight: "40px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: mailDestinataire ? "6px" : 0 }}>
                {mailDestinataire.split(";").filter(e => e.trim()).map((email, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#e8f0fe", color: "#1a56db", borderRadius: "12px", padding: "2px 10px", fontSize: "13px" }}>
                    {email.trim()}
                    <button type="button" onClick={() => {
                      const list = mailDestinataire.split(";").filter(e => e.trim());
                      list.splice(i, 1);
                      setMailDestinataire(list.join(";"));
                    }} style={{ background: "none", border: "none", cursor: "pointer", color: "#1a56db", fontWeight: 700, padding: "0 2px", lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
              <input
                style={{ border: "none", outline: "none", width: "100%", fontSize: "14px", padding: "2px 0" }}
                type="email"
                value={mailInput}
                placeholder="Ajouter un e-mail et appuyer sur Entrée"
                onChange={(e) => setMailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ";" || e.key === ",") {
                    e.preventDefault();
                    const val = mailInput.trim();
                    if (val && val.includes("@")) {
                      const list = mailDestinataire.split(";").filter(e => e.trim());
                      if (!list.includes(val)) {
                        setMailDestinataire([...list, val].join(";"));
                      }
                      setMailInput("");
                    }
                  }
                  if (e.key === "Backspace" && !mailInput) {
                    const list = mailDestinataire.split(";").filter(e => e.trim());
                    list.pop();
                    setMailDestinataire(list.join(";"));
                  }
                }}
                onBlur={() => {
                  const val = mailInput.trim();
                  if (val && val.includes("@")) {
                    const list = mailDestinataire.split(";").filter(e => e.trim());
                    if (!list.includes(val)) setMailDestinataire([...list, val].join(";"));
                    setMailInput("");
                  }
                }}
              />
            </div>
            <div style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>Appuyez sur Entrée, ; ou , pour valider chaque adresse</div>
          </Field>
          {error && <div style={{ color: "#c0392b", marginBottom: "12px", fontSize: "14px" }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <BtnSecondary onClick={closeModal}>Annuler</BtnSecondary>
            <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "..." : "Enregistrer"}</BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Onglet Utilisateurs ─────────────────────────────────────────────────────

function UtilisateursTab({ utilisateurs, magasins, refresh }: { utilisateurs: Utilisateur[]; magasins: Magasin[]; refresh: () => void }) {
  const [modal, setModal] = useState<"create" | "edit" | "pin" | null>(null);
  const [editing, setEditing] = useState<Utilisateur | null>(null);
  const [form, setForm] = useState<Partial<UtilisateurCreate>>({});
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  function openCreate() {
    setForm({ role: "magasinier", magasin_id: magasins[0]?.id });
    setEditing(null); setModal("create"); setError("");
  }
  function openEdit(u: Utilisateur) {
    setForm({ nom: u.nom, prenom: u.prenom, role: u.role, magasin_id: u.magasin_id });
    setEditing(u); setModal("edit"); setError("");
  }
  function openPin(u: Utilisateur) { setEditing(u); setNewPin(""); setModal("pin"); setError(""); }
  function closeModal() { setModal(null); setEditing(null); }

  async function handleSave() {
    if (!form.nom?.trim() || !form.prenom?.trim() || !form.role) { setError("Nom, prénom et rôle requis"); return; }
    if (modal === "create" && form.role !== "admin" && !form.pin) { setError("PIN requis pour la création"); return; }
    setSaving(true); setError("");
    try {
      if (modal === "create") await adminApi.createUtilisateur(form as UtilisateurCreate);
      else if (editing) await adminApi.updateUtilisateur(editing.id, form);
      refresh(); closeModal();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Erreur lors de la sauvegarde");
    }
    setSaving(false);
  }

  async function handleResetPin() {
    if (!newPin || newPin.length < 4) { setError("PIN minimum 4 chiffres"); return; }
    if (!/^\d+$/.test(newPin)) { setError("Le PIN ne doit contenir que des chiffres"); return; }
    if (!editing) return;
    setSaving(true); setError("");
    try { await adminApi.resetPin(editing.id, newPin); closeModal(); }
    catch { setError("Erreur lors de la réinitialisation"); }
    setSaving(false);
  }

  async function handleToggle(u: Utilisateur) {
    try { await adminApi.toggleActif(u.id); refresh(); }
    catch { alert("Erreur"); }
  }

  const filtered = utilisateurs.filter((u) =>
    `${u.nom} ${u.prenom} ${u.role}`.toLowerCase().includes(search.toLowerCase())
  );

  function getMagasinName(id?: number) {
    return id ? (magasins.find((m) => m.id === id)?.nom ?? "—") : "Global";
  }

  const needsMagasin = (role: string) => ["magasinier", "responsable"].includes(role);
  const needsPin = (role: string) => role !== "admin";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px" }}>
        <input
          style={{ ...inputStyle, maxWidth: "240px" }}
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <BtnPrimary onClick={openCreate}>+ Nouvel utilisateur</BtnPrimary>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {filtered.map((u) => (
          <div key={u.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: u.actif ? "#fff" : "#f8f8f8", borderRadius: "8px", padding: "14px 16px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
            opacity: u.actif ? 1 : 0.65,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{
                background: ROLE_COLORS[u.role] ?? "#999", color: "#fff",
                borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
              }}>{ROLE_LABELS[u.role] ?? u.role}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: "15px" }}>{u.prenom} {u.nom}</div>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                  {getMagasinName(u.magasin_id)}
                  {!u.actif && <span style={{ color: "#c0392b", marginLeft: "8px" }}>● Inactif</span>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <BtnSecondary onClick={() => openEdit(u)}>Modifier</BtnSecondary>
              {needsPin(u.role) && <BtnSecondary onClick={() => openPin(u)}>PIN</BtnSecondary>}
              <button onClick={() => handleToggle(u)} style={{
                background: u.actif ? "#e74c3c" : "#27ae60", color: "#fff",
                border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "13px", cursor: "pointer",
              }}>{u.actif ? "Désactiver" : "Activer"}</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "#aaa", padding: "40px" }}>Aucun utilisateur</div>
        )}
      </div>

      {/* Modal Créer / Modifier */}
      {(modal === "create" || modal === "edit") && (
        <Modal title={modal === "create" ? "Nouvel utilisateur" : "Modifier l'utilisateur"} onClose={closeModal}>
          <Field label="Prénom *">
            <input style={inputStyle} value={form.prenom ?? ""} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
          </Field>
          <Field label="Nom *">
            <input style={inputStyle} value={form.nom ?? ""} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          </Field>
          <Field label="Rôle *">
            <select style={selectStyle} value={form.role ?? "magasinier"} onChange={(e) => setForm({ ...form, role: e.target.value as any })}>
              <option value="magasinier">Magasinier</option>
              <option value="responsable">Responsable</option>
              <option value="achats">Achats</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          {needsMagasin(form.role ?? "") && (
            <Field label="Magasin *">
              <select style={selectStyle} value={form.magasin_id ?? ""} onChange={(e) => setForm({ ...form, magasin_id: Number(e.target.value) })}>
                {magasins.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </Field>
          )}
          {modal === "create" && needsPin(form.role ?? "") && (
            <Field label="PIN (4-6 chiffres) *">
              <input style={inputStyle} type="password" inputMode="numeric" maxLength={6}
                value={form.pin ?? ""} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
            </Field>
          )}
          {modal === "create" && form.role === "admin" && (
            <Field label="Mot de passe *">
              <input style={inputStyle} type="password"
                value={form.password ?? ""} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          )}
          {error && <div style={{ color: "#c0392b", marginBottom: "12px", fontSize: "14px" }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <BtnSecondary onClick={closeModal}>Annuler</BtnSecondary>
            <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "..." : "Enregistrer"}</BtnPrimary>
          </div>
        </Modal>
      )}

      {/* Modal Reset PIN */}
      {modal === "pin" && editing && (
        <Modal title={`Réinitialiser le PIN — ${editing.prenom} ${editing.nom}`} onClose={closeModal}>
          <Field label="Nouveau PIN (4-6 chiffres)">
            <input style={inputStyle} type="password" inputMode="numeric" maxLength={6}
              value={newPin} onChange={(e) => setNewPin(e.target.value)} autoFocus />
          </Field>
          {error && <div style={{ color: "#c0392b", marginBottom: "12px", fontSize: "14px" }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <BtnSecondary onClick={closeModal}>Annuler</BtnSecondary>
            <BtnPrimary onClick={handleResetPin} disabled={saving}>{saving ? "..." : "Valider"}</BtnPrimary>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Page Admin principale ───────────────────────────────────────────────────

export default function Admin() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<Tab>("societes");
  const [societes, setSocietes] = useState<Societe[]>([]);
  const [magasins, setMagasins] = useState<Magasin[]>([]);
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.role !== "admin") { navigate("/receptions"); return; }
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true); setError("");
    try {
      const [s, m, u] = await Promise.all([
        adminApi.getSocietes(),
        adminApi.getMagasins(),
        adminApi.getUtilisateurs(),
      ]);
      setSocietes(s); setMagasins(m); setUtilisateurs(u);
    } catch { setError("Impossible de charger les données"); }
    setLoading(false);
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "societes", label: "Sociétés", count: societes.length },
    { key: "magasins", label: "Magasins", count: magasins.length },
    { key: "utilisateurs", label: "Utilisateurs", count: utilisateurs.length },
  ];

  return (
    <Layout>
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "16px" }}>
        {/* En-tête */}
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#2c3e50" }}>
            Administration
          </h2>
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: "14px" }}>
            Gestion des sociétés, magasins et utilisateurs
          </p>
        </div>

        {/* Onglets */}
        <div style={{
          display: "flex", gap: "4px", marginBottom: "20px",
          background: "#f0f0f0", borderRadius: "10px", padding: "4px",
        }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              flex: 1, padding: "10px 8px", border: "none", borderRadius: "8px",
              cursor: "pointer", fontSize: "14px", fontWeight: 600, transition: "all .2s",
              background: activeTab === t.key ? "#fff" : "transparent",
              color: activeTab === t.key ? "#2980b9" : "#555",
              boxShadow: activeTab === t.key ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
            }}>
              {t.label}
              <span style={{
                marginLeft: "6px", background: activeTab === t.key ? "#2980b9" : "#bbb",
                color: "#fff", borderRadius: "10px", padding: "1px 7px", fontSize: "11px",
              }}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Contenu */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px", color: "#888" }}>
            Chargement...
          </div>
        )}
        {error && (
          <div style={{
            background: "#ffeaea", border: "1px solid #e74c3c",
            borderRadius: "8px", padding: "16px", color: "#c0392b", marginBottom: "16px",
          }}>
            {error}
            <button onClick={loadAll} style={{
              marginLeft: "12px", background: "none", border: "1px solid #c0392b",
              borderRadius: "4px", padding: "4px 10px", cursor: "pointer", color: "#c0392b",
            }}>Réessayer</button>
          </div>
        )}
        {!loading && !error && (
          <>
            {activeTab === "societes" && <SocietesTab societes={societes} refresh={loadAll} />}
            {activeTab === "magasins" && <MagasinsTab magasins={magasins} societes={societes} refresh={loadAll} />}
            {activeTab === "utilisateurs" && <UtilisateursTab utilisateurs={utilisateurs} magasins={magasins} refresh={loadAll} />}
          </>
        )}
      </div>
    </Layout>
  );
}
