import { api } from "./client";
import type { ReceptionDetail } from "./receptions";

export interface PushUpdate {
  reception_id: number;
  lignes: { ligne_id: number; quantite_recue: number | null; commentaire: string | null }[];
  nouvelles_lignes: {
    reference_interne: string;
    reference_fournisseur?: string;
    designation: string;
    article_id?: number;
    quantite_recue?: number;
  }[];
  terminer?: boolean;
}

export const syncApi = {
  pull: () =>
    api.get<{ receptions: ReceptionDetail[] }>("/sync/pull").then((r) => r.data.receptions),

  push: (updates: PushUpdate[]) =>
    api.post<{ results: { reception_id: number; success: boolean; message?: string }[] }>(
      "/sync/push",
      { updates }
    ).then((r) => r.data.results),
};
