import unicodedata
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.models import Article, CodeBarre, Utilisateur
from app.schemas.article import ArticleOut, ArticleSearchResult
from app.schemas.code_barre import CodeBarreCreate, CodeBarreOut
from app.models.models import SourceCodeBarre

router = APIRouter(tags=["articles"])


def _normalize(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


@router.get("/articles/recherche", response_model=ArticleSearchResult)
async def recherche_articles(
    q: str = Query(..., min_length=2),
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(get_current_user),
):
    pattern = f"%{q}%"
    result = await db.execute(
        select(Article)
        .where(
            or_(
                Article.reference_interne.ilike(pattern),
                Article.designation.ilike(pattern),
            )
        )
        .order_by(Article.reference_interne)
        .limit(30)
    )
    items = result.scalars().all()
    return ArticleSearchResult(items=items, total=len(items))


@router.get("/articles/par-code-barre/{code}", response_model=ArticleOut)
async def get_article_by_code_barre(
    code: str,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(get_current_user),
):
    result = await db.execute(
        select(CodeBarre).where(CodeBarre.code == code)
    )
    cb = result.scalar_one_or_none()
    if not cb:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Code-barres inconnu")

    result2 = await db.execute(select(Article).where(Article.id == cb.article_id))
    article = result2.scalar_one_or_none()
    return article


@router.post("/codes-barres", response_model=CodeBarreOut, status_code=201)
async def create_code_barre(
    payload: CodeBarreCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Utilisateur = Depends(get_current_user),
):
    from fastapi import HTTPException
    # Vérifier que l'article existe
    result = await db.execute(select(Article).where(Article.id == payload.article_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Article introuvable")

    # Vérifier l'unicité du code
    r2 = await db.execute(select(CodeBarre).where(CodeBarre.code == payload.code))
    if r2.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ce code-barres est déjà associé à un article")

    cb = CodeBarre(
        article_id=payload.article_id,
        code=payload.code,
        source=SourceCodeBarre.ajout_terrain,
        created_by_user_id=current_user.id,
    )
    db.add(cb)
    await db.flush()
    return cb
