from pydantic import BaseModel


class ArticleOut(BaseModel):
    id: int
    reference_interne: str
    designation: str

    model_config = {"from_attributes": True}


class ArticleSearchResult(BaseModel):
    items: list[ArticleOut]
    total: int
