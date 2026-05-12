from datetime import datetime, timedelta, timezone
from typing import Any
import hashlib

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import get_settings

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Stockage en mémoire des tentatives PIN (remplacer par Redis en prod multi-instance)
_pin_attempts: dict[int, list[datetime]] = {}


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_pin(pin: str) -> str:
    return pwd_context.hash(pin)


def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    return pwd_context.verify(plain_pin, hashed_pin)


def create_access_token(subject: Any, extra: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(subject), "exp": expire, "type": "access"}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: Any) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(subject), "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def is_locked_out(user_id: int) -> bool:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=settings.PIN_LOCKOUT_MINUTES)
    attempts = [t for t in _pin_attempts.get(user_id, []) if t > cutoff]
    _pin_attempts[user_id] = attempts
    return len(attempts) >= settings.PIN_MAX_ATTEMPTS


def record_failed_attempt(user_id: int) -> int:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=settings.PIN_LOCKOUT_MINUTES)
    attempts = [t for t in _pin_attempts.get(user_id, []) if t > cutoff]
    attempts.append(now)
    _pin_attempts[user_id] = attempts
    return len(attempts)


def clear_attempts(user_id: int) -> None:
    _pin_attempts.pop(user_id, None)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()
