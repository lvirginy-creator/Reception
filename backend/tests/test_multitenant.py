"""Tests : isolation multi-tenant — un magasinier ne voit pas les réceptions d'un autre magasin."""
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.models import Reception, LigneReception, StatutReception, Utilisateur, RoleUtilisateur


def _auth_header(user: Utilisateur) -> dict:
    token = create_access_token(user.id, extra={"role": user.role.value, "magasin_id": user.magasin_id})
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def receptions_fixture(db_session: AsyncSession, seed_data):
    data = seed_data
    r1 = Reception(
        numero_en="EN001", magasin_id=data["magasin1"].id,
        code_fournisseur="F01", fournisseur_nom="Fournisseur A",
        statut=StatutReception.en_cours, saisie_aveugle=True,
    )
    r2 = Reception(
        numero_en="EN002", magasin_id=data["magasin2"].id,
        code_fournisseur="F02", fournisseur_nom="Fournisseur B",
        statut=StatutReception.en_cours, saisie_aveugle=True,
    )
    db_session.add_all([r1, r2])
    await db_session.commit()
    return {"r1": r1, "r2": r2, **data}


@pytest.mark.asyncio
async def test_magasinier_voit_uniquement_son_magasin(client, receptions_fixture):
    data = receptions_fixture
    magasinier = data["magasinier"]  # rattaché à magasin1

    resp = await client.get("/receptions", headers=_auth_header(magasinier))
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert data["r1"].id in ids
    assert data["r2"].id not in ids, "Le magasinier ne doit pas voir les réceptions de Magasin B"


@pytest.mark.asyncio
async def test_magasinier_ne_peut_pas_acceder_reception_autre_magasin(client, receptions_fixture):
    data = receptions_fixture
    magasinier = data["magasinier"]

    resp = await client.get(f"/receptions/{data['r2'].id}", headers=_auth_header(magasinier))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_voit_tous_les_magasins(client, receptions_fixture):
    data = receptions_fixture
    admin = data["admin"]

    resp = await client.get("/receptions", headers=_auth_header(admin))
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()]
    assert data["r1"].id in ids
    assert data["r2"].id in ids
