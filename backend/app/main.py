from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import get_settings
from app.core.database import engine, Base

settings = get_settings()
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Démarrage
    logger.info("Démarrage de l'application")
    from app.tasks.scheduler import start_scheduler
    start_scheduler()
    yield
    # Arrêt
    from app.tasks.scheduler import stop_scheduler
    stop_scheduler()
    await engine.dispose()
    logger.info("Application arrêtée")


app = FastAPI(
    title="API Réception",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS strict
origins = settings.CORS_ORIGINS
if settings.DOMAIN_NAME and settings.DOMAIN_NAME != "localhost":
    origins = [f"https://{settings.DOMAIN_NAME}"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# Routers
from app.api.auth import router as auth_router
from app.api.receptions import router as receptions_router
from app.api.articles import router as articles_router
from app.api.sync import router as sync_router
from app.api.admin.societes import router as societes_router
from app.api.admin.magasins import router as magasins_router
from app.api.admin.utilisateurs import router as utilisateurs_router
from app.api.admin.parametres import router as parametres_router
from app.api.admin.imports import router as imports_router
from app.api.media import router as media_router

app.include_router(auth_router)
app.include_router(receptions_router)
app.include_router(articles_router)
app.include_router(sync_router)
app.include_router(societes_router)
app.include_router(magasins_router)
app.include_router(utilisateurs_router)
app.include_router(parametres_router)
app.include_router(imports_router)
app.include_router(media_router)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok"}
