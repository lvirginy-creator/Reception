import { Page, expect } from "@playwright/test";

const BASE = process.env.API_URL || "http://localhost:8000";

/** Connexion via PIN (magasinier / responsable) */
export async function loginPin(page: Page, magasinCode: string, pin: string) {
  await page.goto("/login");
  // Saisir le code magasin
  await page.getByPlaceholder(/code magasin/i).fill(magasinCode);
  // Saisir le PIN chiffre par chiffre via le clavier virtuel
  for (const digit of pin) {
    await page.getByRole("button", { name: digit }).first().click();
  }
  await page.getByRole("button", { name: /se connecter/i }).click();
  await expect(page).toHaveURL(/receptions/);
}

/** Connexion admin (login + mot de passe via API directe, retourne le token) */
export async function getAdminToken(): Promise<string> {
  const resp = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Admin2024!" }),
  });
  const data = await resp.json();
  return data.access_token;
}

/** Crée une réception de test via l'API et retourne son id */
export async function createTestReception(token: string, magasinId: number): Promise<number> {
  // On insère directement via seed si l'API ne l'expose pas publiquement.
  // Ici on utilise l'endpoint sync/pull après un import simulé.
  // Pour les tests E2E on suppose que seed.py a déjà été lancé.
  const resp = await fetch(`${BASE}/receptions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json();
  return data[0]?.id;
}

/** Injecte un token JWT dans le localStorage pour bypasser l'écran de login */
export async function injectAuth(page: Page, token: string, user: Record<string, unknown>) {
  await page.goto("/login");
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem(
        "reception-auth",
        JSON.stringify({ state: { user: { ...user, access_token: token, refresh_token: token } }, version: 0 })
      );
    },
    { token, user }
  );
  await page.reload();
}
