"""Tests : logique import codes-barres (upsert intelligent)."""
import io
import pytest
import pytest_asyncio
import openpyxl
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.models import Article, CodeBarre, SourceCodeBarre
from app.services.import_ftp import _process_codes_barres_file


def _make_xlsx(rows: list[tuple]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Référence interne", "Code-barres"])
    for row in rows:
        ws.append(list(row))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest_asyncio.fixture
async def articles_fixture(db_session: AsyncSession):
    a1 = Article(reference_interne="ART001", designation="Article 1")
    a2 = Article(reference_interne="ART002", designation="Article 2")
    db_session.add_all([a1, a2])
    await db_session.flush()

    # Code-barres terrain existant sur ART001 (ne doit pas être supprimé)
    cb_terrain = CodeBarre(
        article_id=a1.id, code="TERRAIN_001",
        source=SourceCodeBarre.ajout_terrain,
    )
    db_session.add(cb_terrain)
    await db_session.commit()
    return {"a1": a1, "a2": a2, "cb_terrain": cb_terrain}


@pytest.mark.asyncio
async def test_import_cree_nouveaux_codes(db_session, articles_fixture):
    content = _make_xlsx([("ART001", "CB_IMPORT_001"), ("ART002", "CB_IMPORT_002")])
    nb, errors = await _process_codes_barres_file(db_session, content)
    assert nb == 2
    assert errors == 0

    result = await db_session.execute(
        select(CodeBarre).where(CodeBarre.code == "CB_IMPORT_001")
    )
    cb = result.scalar_one_or_none()
    assert cb is not None
    assert cb.source == SourceCodeBarre.import_


@pytest.mark.asyncio
async def test_import_conserve_codes_terrain(db_session, articles_fixture):
    """Les codes ajout_terrain ne doivent jamais être supprimés par un import."""
    data = articles_fixture

    # Import sans TERRAIN_001
    content = _make_xlsx([("ART001", "CB_IMPORT_NEW")])
    await _process_codes_barres_file(db_session, content)

    result = await db_session.execute(
        select(CodeBarre).where(CodeBarre.code == "TERRAIN_001")
    )
    cb = result.scalar_one_or_none()
    assert cb is not None, "Le code terrain doit être conservé même absent du fichier import"


@pytest.mark.asyncio
async def test_import_supprime_anciens_codes_import(db_session, articles_fixture):
    """Les codes source='import' absents du nouveau fichier doivent être supprimés."""
    data = articles_fixture

    # Premier import avec CB_OLD
    content1 = _make_xlsx([("ART001", "CB_OLD")])
    await _process_codes_barres_file(db_session, content1)
    await db_session.commit()

    # Deuxième import sans CB_OLD
    content2 = _make_xlsx([("ART001", "CB_NEW")])
    await _process_codes_barres_file(db_session, content2)
    await db_session.commit()

    result = await db_session.execute(select(CodeBarre).where(CodeBarre.code == "CB_OLD"))
    assert result.scalar_one_or_none() is None, "CB_OLD doit être supprimé après le second import"

    result2 = await db_session.execute(select(CodeBarre).where(CodeBarre.code == "CB_NEW"))
    assert result2.scalar_one_or_none() is not None
