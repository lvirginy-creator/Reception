import { api } from "./client";

export interface Article {
  id: number;
  reference_interne: string;
  designation: string;
}

export const articlesApi = {
  search: (q: string) =>
    api.get<{ items: Article[]; total: number }>("/articles/recherche", { params: { q } })
      .then((r) => r.data.items),

  getByBarcode: (code: string) =>
    api.get<Article>(`/articles/par-code-barre/${encodeURIComponent(code)}`).then((r) => r.data),

  associateBarcode: (article_id: number, code: string) =>
    api.post("/codes-barres", { article_id, code }).then((r) => r.data),
};
