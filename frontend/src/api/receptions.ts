import { api } from "./client";

export interface Photo {
  id: number;
  chemin_fichier: string;
  commentaire: string | null;
  uploaded_at: string;
}

export interface Ligne {
  id: number;
  reception_id: number;
  article_id: number | null;
  reference_interne: string;
  reference_fournisseur: string | null;
  designation: string;
  quantite_attendue: number | null;
  quantite_recue: number | null;
  ajout_hors_commande: boolean;
  commentaire: string | null;
  modifie_le: string | null;
  photos: Photo[];
}

export interface Reception {
  id: number;
  numero_en: string;
  magasin_id: number;
  code_fournisseur: string;
  fournisseur_nom: string;
  date_import: string;
  statut: "en_cours" | "prete" | "valide" | "envoye" | "archive";
  saisie_aveugle: boolean;
  valide_le: string | null;
  total_lignes: number;
  lignes_saisies: number;
}

export interface ReceptionDetail extends Reception {
  lignes: Ligne[];
  valide_par_nom: string | null;
}

export interface LigneCreate {
  reference_interne: string;
  reference_fournisseur?: string;
  designation: string;
  article_id?: number;
  quantite_recue?: number;
  commentaire?: string;
}

export const receptionsApi = {
  list: (params?: { statut?: string; fournisseur?: string }) =>
    api.get<Reception[]>("/receptions", { params }).then((r) => r.data),

  get: (id: number) =>
    api.get<ReceptionDetail>(`/receptions/${id}`).then((r) => r.data),

  updateLigne: (receptionId: number, ligneId: number, data: { quantite_recue?: number; commentaire?: string }) =>
    api.patch(`/receptions/${receptionId}/lignes/${ligneId}`, data),

  addLigne: (receptionId: number, data: LigneCreate) =>
    api.post(`/receptions/${receptionId}/lignes`, data).then((r) => r.data),

  uploadPhoto: (receptionId: number, ligneId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post(`/receptions/${receptionId}/lignes/${ligneId}/photos`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },

  terminer: (id: number) =>
    api.post<Reception>(`/receptions/${id}/terminer`).then((r) => r.data),

  valider: (id: number) =>
    api.post<Reception>(`/receptions/${id}/valider`).then((r) => r.data),

  toggleSaisieAveugle: (id: number, actif: boolean) =>
    api.patch<Reception>(`/receptions/${id}/saisie-aveugle`, { actif }).then((r) => r.data),
};
