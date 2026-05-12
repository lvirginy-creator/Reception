from pydantic import BaseModel
from typing import Any


class ParametreOut(BaseModel):
    cle: str
    valeur: Any

    model_config = {"from_attributes": True}


class ParametreUpdate(BaseModel):
    valeur: Any
