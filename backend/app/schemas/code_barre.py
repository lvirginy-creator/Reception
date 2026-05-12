from datetime import datetime
from pydantic import BaseModel
from app.models.models import SourceCodeBarre


class CodeBarreCreate(BaseModel):
    article_id: int
    code: str


class CodeBarreOut(BaseModel):
    id: int
    article_id: int
    code: str
    source: SourceCodeBarre
    created_at: datetime

    model_config = {"from_attributes": True}
