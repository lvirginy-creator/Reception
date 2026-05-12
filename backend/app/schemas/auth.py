from pydantic import BaseModel, field_validator
import re


class PinLoginRequest(BaseModel):
    magasin_code: str
    pin: str

    @field_validator("pin")
    @classmethod
    def pin_format(cls, v: str) -> str:
        if not re.match(r"^\d{4,6}$", v):
            raise ValueError("Le PIN doit comporter 4 à 6 chiffres")
        return v


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: int
    role: str
    nom: str
    prenom: str
    magasin_id: int | None = None
    magasin_nom: str | None = None
