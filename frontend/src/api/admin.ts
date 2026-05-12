import { api as client } from "./client";

export interface Societe {
  id: number;
  nom: string;
  code: string;
}

export interface Magasin {
  id: number;
  nom: string;
  code: string;
  societe_id: number;
  mail_destinataire?: string;
  actif: boolean;
  societe_nom?: string;
}

export interface Utilisateur {
  id: number;
  nom: string;
  prenom: string;
  role: "magasinier" | "responsable" | "achats" | "admin";
  magasin_id?: number;
  magasin_nom?: string;
  actif: boolean;
}

export interface UtilisateurCreate {
  nom: string;
  prenom: string;
  role: string;
  magasin_id?: number;
  pin?: string;
  password?: string;
}

export const adminApi = {
  // Sociétés
  getSocietes: () => client.get<Societe[]>("/admin/societes").then((r) => r.data),
  createSociete: (data: Omit<Societe, "id">) =>
    client.post<Societe>("/admin/societes", data).then((r) => r.data),
  updateSociete: (id: number, data: Partial<Omit<Societe, "id">>) =>
    client.patch<Societe>(`/admin/societes/${id}`, data).then((r) => r.data),
  deleteSociete: (id: number) => client.delete(`/admin/societes/${id}`),

  // Magasins
  getMagasins: () => client.get<Magasin[]>("/admin/magasins").then((r) => r.data),
  createMagasin: (data: Omit<Magasin, "id" | "actif" | "societe_nom">) =>
    client.post<Magasin>("/admin/magasins", data).then((r) => r.data),
  updateMagasin: (id: number, data: Partial<Omit<Magasin, "id" | "actif" | "societe_nom">>) =>
    client.patch<Magasin>(`/admin/magasins/${id}`, data).then((r) => r.data),
  deleteMagasin: (id: number) => client.delete(`/admin/magasins/${id}`),

  // Utilisateurs
  getUtilisateurs: () => client.get<Utilisateur[]>("/admin/utilisateurs").then((r) => r.data),
  createUtilisateur: (data: UtilisateurCreate) =>
    client.post<Utilisateur>("/admin/utilisateurs", data).then((r) => r.data),
  updateUtilisateur: (id: number, data: Partial<UtilisateurCreate>) =>
    client.patch<Utilisateur>(`/admin/utilisateurs/${id}`, data).then((r) => r.data),
  toggleActif: (id: number) =>
    client.post<Utilisateur>(`/admin/utilisateurs/${id}/toggle-actif`).then((r) => r.data),
  resetPin: (id: number, pin: string) =>
    client.post(`/admin/utilisateurs/${id}/reset-pin`, { pin }),
};
