import Dexie, { type Table } from "dexie";

export interface OfflineReception {
  id: number;
  numero_en: string;
  magasin_id: number;
  code_fournisseur: string;
  fournisseur_nom: string;
  date_import: string;
  statut: string;
  saisie_aveugle: boolean;
  valide_le: string | null;
  total_lignes: number;
  lignes_saisies: number;
  lignes: OfflineLigne[];
  synced_at: number;
}

export interface OfflineLigne {
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
}

export interface PendingUpdate {
  id?: number;
  reception_id: number;
  ligne_id: number;
  quantite_recue: number | null;
  commentaire: string | null;
  created_at: number;
}

export interface PendingPhoto {
  id?: number;
  reception_id: number;
  ligne_id: number;
  blob: Blob;
  created_at: number;
}

class ReceptionDB extends Dexie {
  receptions!: Table<OfflineReception>;
  pending_updates!: Table<PendingUpdate>;
  pending_photos!: Table<PendingPhoto>;

  constructor() {
    super("ReceptionDB");
    this.version(1).stores({
      receptions: "id, magasin_id, statut",
      pending_updates: "++id, reception_id",
      pending_photos: "++id, reception_id, ligne_id",
    });
  }
}

export const db = new ReceptionDB();
