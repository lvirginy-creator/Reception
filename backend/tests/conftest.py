"""Fixtures pytest partagées."""
import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.database import Base, get_db
from app.main import app
from app.core.security import hash_pin, hash_password
from app.models.models import (
    Societe, Magasin, Utilisateur, RoleUtilisateur,
    Article, Reception, LigneReception, StatutReception,
)

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def db_session():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        # SQLite ne supporte pas les enums PostgreSQL — on utilise String
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession):
    async def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def seed_data(db_session: AsyncSession):
    """Données de base : 1 société, 2 magasins, 3 utilisateurs."""
    societe = Societe(nom="Groupe Test", code="GRP")
    db_session.add(societe)
    await db_session.flush()

    magasin1 = Magasin(societe_id=societe.id, nom="Magasin A", code="MAG_A", actif=True)
    magasin2 = Magasin(societe_id=societe.id, nom="Magasin B", code="MAG_B", actif=True)
    db_session.add_all([magasin1, magasin2])
    await db_session.flush()

    magasinier = Utilisateur(
        magasin_id=magasin1.id, nom="Martin", prenom="Jean",
        role=RoleUtilisateur.magasinier, pin_hash=hash_pin("1234"), actif=True,
    )
    responsable = Utilisateur(
        magasin_id=magasin1.id, nom="Dupont", prenom="Marie",
        role=RoleUtilisateur.responsable, pin_hash=hash_pin("5678"), actif=True,
    )
    admin = Utilisateur(
        nom="admin", prenom="Admin",
        role=RoleUtilisateur.admin, password_hash=hash_password("admin123"), actif=True,
    )
    db_session.add_all([magasinier, responsable, admin])
    await db_session.flush()
    await db_session.commit()

    return {
        "societe": societe,
        "magasin1": magasin1,
        "magasin2": magasin2,
        "magasinier": magasinier,
        "responsable": responsable,
        "admin": admin,
    }
