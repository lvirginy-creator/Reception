from pydantic import BaseModel


class SocieteBase(BaseModel):
    nom: str
    code: str


class SocieteCreate(SocieteBase):
    pass


class SocieteUpdate(BaseModel):
    nom: str | None = None
    code: str | None = None


class SocieteOut(SocieteBase):
    id: int

    model_config = {"from_attributes": True}
