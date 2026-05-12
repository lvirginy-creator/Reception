/**
 * Scénario 3 : Validation responsable complète
 *
 * Prérequis : une réception doit être au statut "prete" (magasinier a terminé).
 *
 * 1. Le responsable se connecte avec son PIN.
 * 2. Il voit le bouton "Valider" sur la réception prête.
 * 3. Il ouvre la vue validation.
 * 4. Il peut modifier une quantité.
 * 5. Il désactive la saisie à l'aveugle → les quantités attendues apparaissent.
 * 6. Il clique "Valider et envoyer" → modal de confirmation → confirme.
 * 7. La réception passe au statut "valide" ou "envoye".
 * 8. Plus aucune modification n'est possible après validation.
 */

import { test, expect, request } from "@playwright/test";
import { loginPin } from "./helpers";

const MAGASIN_CODE = "PAP";
const PIN_MAGASINIER = "1234";
const PIN_RESPONSABLE = "5678";
const API = process.env.API_URL || "http://localhost:8000";

test.describe("Scénario 3 — Validation responsable", () => {
  let receptionId: number;

  // Préparer une réception au statut "prete" via l'API
  test.beforeAll(async () => {
    // Login magasinier
    const loginResp = await fetch(`${API}/auth/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ magasin_code: MAGASIN_CODE, pin: PIN_MAGASINIER }),
    });
    const loginData = await loginResp.json();
    const tokenMag = loginData.access_token;

    // Récupérer une réception en cours
    const listResp = await fetch(`${API}/receptions?statut=en_cours`, {
      headers: { Authorization: `Bearer ${tokenMag}` },
    });
    const list = await listResp.json();
    if (!list.length) {
      console.warn("Aucune réception en cours pour le test — le scénario sera sauté");
      return;
    }
    receptionId = list[0].id;

    // Saisir 0 sur toutes les lignes
    const detailResp = await fetch(`${API}/receptions/${receptionId}`, {
      headers: { Authorization: `Bearer ${tokenMag}` },
    });
    const detail = await detailResp.json();
    for (const ligne of detail.lignes) {
      await fetch(`${API}/receptions/${receptionId}/lignes/${ligne.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tokenMag}`, "Content-Type": "application/json" },
        body: JSON.stringify({ quantite_recue: ligne.quantite_attendue ?? 0 }),
      });
    }

    // Terminer la saisie
    await fetch(`${API}/receptions/${receptionId}/terminer`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenMag}` },
    });
  });

  test("le responsable voit le bouton Valider sur les réceptions prêtes", async ({ page }) => {
    await loginPin(page, MAGASIN_CODE, PIN_RESPONSABLE);
    // Le bouton "Valider" doit être présent
    await expect(page.getByRole("button", { name: /valider cette réception/i })).toBeVisible({ timeout: 8000 });
  });

  test("désactiver la saisie à l'aveugle affiche les quantités attendues", async ({ page }) => {
    await loginPin(page, MAGASIN_CODE, PIN_RESPONSABLE);

    // Aller sur la vue validation
    await page.getByRole("button", { name: /valider cette réception/i }).first().click();
    await expect(page).toHaveURL(/validation/);

    // Le toggle saisie aveugle doit être présent
    await expect(page.getByText(/saisie à l'aveugle/i)).toBeVisible();

    // Si activé, cliquer pour désactiver
    const toggle = page.locator("button[style*='8e44ad']");
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(800);
      // Les colonnes "Attendu" doivent maintenant être visibles dans le tableau
      await expect(page.getByRole("columnheader", { name: /attendu/i })).toBeVisible();
    }
  });

  test("validation complète → statut valide, plus de modification possible", async ({ page }) => {
    if (!receptionId) test.skip();

    await loginPin(page, MAGASIN_CODE, PIN_RESPONSABLE);

    // Aller sur la vue validation
    await page.getByRole("button", { name: /valider cette réception/i }).first().click();
    await expect(page).toHaveURL(/validation/, { timeout: 6000 });

    // Modifier une quantité avant validation
    const qtyInputs = page.locator("table input[type='number']");
    if (await qtyInputs.count() > 0) {
      await qtyInputs.first().fill("99");
      await qtyInputs.first().blur();
      await page.waitForTimeout(500);
    }

    // Cliquer "Valider et envoyer"
    await page.getByRole("button", { name: /valider et envoyer/i }).click();

    // Modal de confirmation
    await expect(page.getByText(/confirmer la validation/i)).toBeVisible();
    await page.getByRole("button", { name: /^valider$/i }).click();

    // Retour à la liste
    await expect(page).toHaveURL(/receptions$/, { timeout: 10000 });

    // La réception ne doit plus apparaître en statut "en_cours" ou "prete"
    await expect(page.getByText(/Prête à valider/i)).not.toBeVisible();
  });

  test("après validation : aucune saisie n'est possible (lecture seule)", async ({ page }) => {
    if (!receptionId) test.skip();

    await loginPin(page, MAGASIN_CODE, PIN_MAGASINIER);

    // Ouvrir la réception
    await page.goto(`/receptions/${receptionId}`);
    await page.waitForTimeout(1000);

    // Les inputs de quantité ne doivent plus être présents
    const editableInputs = page.locator('input[type="number"]');
    const count = await editableInputs.count();
    expect(count).toBe(0);

    // Le bouton "Terminer la saisie" ne doit pas être présent
    await expect(page.getByRole("button", { name: /terminer la saisie/i })).not.toBeVisible();
  });
});
