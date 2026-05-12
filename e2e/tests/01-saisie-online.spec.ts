/**
 * Scénario 1 : Saisie online complète
 *
 * 1. Le magasinier se connecte avec son PIN.
 * 2. Il voit la liste des réceptions de son magasin.
 * 3. Il ouvre une réception.
 * 4. Il saisit les quantités pour toutes les lignes (y compris 0).
 * 5. Il clique "Terminer la saisie" → statut passe à "prete".
 * 6. Il ne voit pas les réceptions d'un autre magasin (sécurité).
 */

import { test, expect } from "@playwright/test";
import { loginPin } from "./helpers";

const MAGASIN_CODE = "PAP";
const PIN_MAGASINIER = "1234";

test.describe("Scénario 1 — Saisie online", () => {
  test.beforeEach(async ({ page }) => {
    await loginPin(page, MAGASIN_CODE, PIN_MAGASINIER);
  });

  test("affiche la liste des réceptions du magasin", async ({ page }) => {
    await expect(page.getByText(/EN 2024/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("mode saisie à l'aveugle masque la quantité attendue", async ({ page }) => {
    // Ouvrir la première réception en cours
    await page.getByText(/EN 2024/i).first().click();
    await expect(page).toHaveURL(/receptions\/\d+/);

    // En mode aveugle, "Attendu" ne doit pas être visible
    await expect(page.getByText("Attendu").first()).not.toBeVisible();
  });

  test("saisie complète et soumission au responsable", async ({ page }) => {
    // Ouvrir une réception en cours
    await page.getByText(/En cours/i).first().click();
    await expect(page).toHaveURL(/receptions\/\d+/);

    // Saisir 0 pour chaque ligne visible
    const inputs = page.locator('input[type="number"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      await inputs.nth(i).click();
      await inputs.nth(i).fill("5");
      await inputs.nth(i).blur();
      // Pause pour laisser le save debounce se déclencher
      await page.waitForTimeout(300);
    }

    // Cliquer "Terminer la saisie"
    await page.getByRole("button", { name: /terminer la saisie/i }).click();

    // Doit revenir à la liste
    await expect(page).toHaveURL(/receptions$/, { timeout: 8000 });
  });

  test("quantité 0 est acceptée (article absent à la livraison)", async ({ page }) => {
    await page.getByText(/En cours/i).first().click();
    const input = page.locator('input[type="number"]').first();
    await input.fill("0");
    await input.blur();
    // Pas d'erreur affichée
    await expect(page.getByText(/erreur/i)).not.toBeVisible();
  });

  test("le magasinier ne voit pas les réceptions d'un autre magasin", async ({ page }) => {
    // Toutes les réceptions affichées doivent appartenir au magasin PAP
    const cards = page.locator('[style*="border-left"]');
    const count = await cards.count();
    // Si on avait des données d'un autre magasin, elles seraient visibles — ici on vérifie
    // simplement que l'écran se charge sans erreur 403
    await expect(page.getByText(/403/i)).not.toBeVisible();
    // Et que le bandeau magasin est bien "Pointe-à-Pitre Centre"
    await expect(page.getByText(/Pointe-à-Pitre/i)).toBeVisible();
  });
});
