from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://reception:reception@localhost:5432/reception_db"

    # JWT
    JWT_SECRET: str = "change_me_in_production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 720   # 12h
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # PIN lockout
    PIN_MAX_ATTEMPTS: int = 5
    PIN_LOCKOUT_MINUTES: int = 10

    # FTP
    FTP_HOST: str = ""
    FTP_USER: str = ""
    FTP_PASSWORD: str = ""
    FTP_PORT: int = 22
    FTP_USE_SFTP: bool = True
    FTP_PATH_RECEPTIONS: str = "/receptions"
    FTP_PATH_CODES_BARRES: str = "/codes_barres"

    # SMTP
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    MAIL_ACHATS: str = ""

    # Storage
    STORAGE_PDF: str = "/app/storage/pdf"
    STORAGE_PHOTOS: str = "/app/storage/photos"
    STORAGE_FTP_ARCHIVE: str = "/app/storage/ftp_archive"

    # App
    DOMAIN_NAME: str = "localhost"
    ENVIRONMENT: str = "production"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
