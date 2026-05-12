from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.api.deps import require_admin
from app.models.models import Utilisateur, ImportLog
from app.schemas.import_log import ImportLogOut

router = APIRouter(prefix="/admin/imports", tags=["admin"])


@router.get("/logs", response_model=list[ImportLogOut])
async def get_import_logs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    result = await db.execute(
        select(ImportLog).order_by(ImportLog.started_at.desc()).limit(limit)
    )
    return result.scalars().all()


@router.post("/declencher", status_code=202)
async def trigger_import(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: Utilisateur = Depends(require_admin()),
):
    from app.services.import_ftp import run_all_imports
    background_tasks.add_task(run_all_imports)
    return {"message": "Import déclenché en arrière-plan"}
