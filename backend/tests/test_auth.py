"""Tests : authentification PIN et admin."""
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import hash_pin, hash_password
from app.models.models import Utilisateur, Magasin, Societe, RoleUtilisateur


@pytest.mark.asyncio
async def test_pin_login_success(client, seed_data):
    resp = await client.post("/auth/pin", json={"magasin_code": "MAG_A", "pin": "1234"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "magasinier"


@pytest.mark.asyncio
async def test_pin_login_wrong_pin(client, seed_data):
    resp = await client.post("/auth/pin", json={"magasin_code": "MAG_A", "pin": "0000"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_pin_login_wrong_magasin(client, seed_data):
    resp = await client.post("/auth/pin", json={"magasin_code": "INCONNU", "pin": "1234"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_admin_login_success(client, seed_data):
    resp = await client.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_admin_login_wrong_password(client, seed_data):
    resp = await client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_health_endpoint(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
