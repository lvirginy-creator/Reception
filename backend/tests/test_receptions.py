"""Tests : règles métier réceptions (validation incomplète, calcul écarts, codes-barres)."""
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.models import (
    Article, CodeBarre, Reception, LigneReception,
    StatutReception, SourceCodeBarre, Utilisateur,
)


def _auth_header(user: Utilisateur) -> dict:
    token = create_access_token(user.id, extra={"role": user.role.value, "magasin_id": user.magasin_id})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def reception_avec_lignes(db_session: AsyncSession, seed_data):
    data = seed_data
    article1 = Article(reference_interne="REF001", designation="Produit A")
    article2 = Article(reference_interne="REF002", designation="Produit B")
    db_session.add_all([article1, article2])
    await db_session.flush()

    r = Reception(
        numero_en="EN100", magasin_id=data["magasin1"].id,
        code_fournisseur="F99", fournisseur_nom="Fournisseur Test",
        statut=StatutReception.en_cours, saisie_aveugle=True,
    )
    db_session.add(r)
    await db_session.flush()

    l1 = LigneReception(
        reception_id=r.id, article_id=article1.id,
        reference_interne="REF001", designation="Produit A",
        quantite_attendue=10, quantite_recue=None,
    )
    l2 = LigneReception(
        reception_id=r.id, article_id=article2.id,
        reference_interne="REF002", designation="Produit B",
        quantite_attendue=5, quantite_recue=None,
    )
    db_session.add_all([l1, l2])
    await db_session.commit()
    return {"reception": r, "l1": l1, "l2": l2, "article1": article1, **data}


@pytest.mark.asyncio
async def test_terminer_bloque_si_ligne_non_saisie(client, reception_avec_lignes):
    data = reception_avec_lignes
    magasinier = data["magasinier"]

    resp = await client.post(
        f"/receptions/{data['reception'].id}/terminer",
        headers=_auth_header(magasinier),
    )
    assert resp.status_code == 422
    assert "incomplète" in resp.json()["detail"].lower() or "saisie" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_terminer_ok_si_toutes_lignes_saisies(client, db_session, reception_avec_lignes):
    data = reception_avec_lignes
    magasinier = data["magasinier"]

    # Saisir les deux lignes
    for ligne_id in [data["l1"].id, data["l2"].id]:
        r = await client.patch(
            f"/receptions/{data['reception'].id}/lignes/{ligne_id}",
            json={"quantite_recue": 0},
            headers=_auth_header(magasinier),
        )
        assert r.status_code == 200

    resp = await client.post(
        f"/receptions/{data['reception'].id}/terminer",
        headers=_auth_header(magasinier),
    )
    assert resp.status_code == 200
    assert resp.json()["statut"] == "prete"


@pytest.mark.asyncio
async def test_quantite_zero_est_valide(client, reception_avec_lignes):
    """La quantité 0 est une saisie valide (article absent à la livraison)."""
    data = reception_avec_lignes
    magasinier = data["magasinier"]

    resp = await client.patch(
        f"/receptions/{data['reception'].id}/lignes/{data['l1'].id}",
        json={"quantite_recue": 0},
        headers=_auth_header(magasinier),
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_code_barre_association_et_resolution(client, db_session, reception_avec_lignes):
    """Un code-barres ajouté terrain doit être résolu immédiatement."""
    data = reception_avec_lignes
    magasinier = data["magasinier"]

    # Associer un code-barres à article1
    resp = await client.post(
        "/codes-barres",
        json={"article_id": data["article1"].id, "code": "3760001234567"},
        headers=_auth_header(magasinier),
    )
    assert resp.status_code == 201

    # Le code doit être résolvable immédiatement
    resp2 = await client.get("/articles/par-code-barre/3760001234567", headers=_auth_header(magasinier))
    assert resp2.status_code == 200
    assert resp2.json()["reference_interne"] == "REF001"


@pytest.mark.asyncio
async def test_code_barre_duplique_refuse(client, db_session, reception_avec_lignes):
    """Un même code-barres ne peut pointer que vers un seul article."""
    data = reception_avec_lignes
    magasinier = data["magasinier"]

    await client.post(
        "/codes-barres",
        json={"article_id": data["article1"].id, "code": "CODE_UNIQUE_TEST"},
        headers=_auth_header(magasinier),
    )
    resp = await client.post(
        "/codes-barres",
        json={"article_id": data["article1"].id, "code": "CODE_UNIQUE_TEST"},
        headers=_auth_header(magasinier),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_reception_non_modifiable_apres_validation(client, db_session, reception_avec_lignes):
    """Après validation, aucune modification n'est possible."""
    from app.models.models import StatutReception
    data = reception_avec_lignes
    data["reception"].statut = StatutReception.valide
    await db_session.commit()

    responsable = data["responsable"]
    resp = await client.patch(
        f"/receptions/{data['reception'].id}/lignes/{data['l1'].id}",
        json={"quantite_recue": 5},
        headers=_auth_header(responsable),
    )
    assert resp.status_code == 400


def test_calcul_ecart():
    """Test pur du calcul d'écart (sans DB)."""
    from app.models.models import LigneReception

    l = LigneReception(quantite_attendue=10, quantite_recue=8)
    ecart = l.quantite_recue - l.quantite_attendue
    assert ecart == -2  # manquant

    l2 = LigneReception(quantite_attendue=5, quantite_recue=7)
    assert l2.quantite_recue - l2.quantite_attendue == 2  # surplus

    l3 = LigneReception(quantite_attendue=3, quantite_recue=3)
    assert l3.quantite_recue - l3.quantite_attendue == 0  # conforme
