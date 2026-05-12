"""Tests : sécurité (lockout PIN, JWT, bcrypt)."""
import pytest
from app.core.security import (
    hash_pin, verify_pin, hash_password, verify_password,
    create_access_token, decode_token,
    is_locked_out, record_failed_attempt, clear_attempts,
)


def test_pin_hash_verify():
    hashed = hash_pin("1234")
    assert verify_pin("1234", hashed)
    assert not verify_pin("0000", hashed)


def test_password_hash_verify():
    hashed = hash_password("secret123")
    assert verify_password("secret123", hashed)
    assert not verify_password("wrong", hashed)


def test_jwt_round_trip():
    token = create_access_token(subject=42, extra={"role": "magasinier"})
    payload = decode_token(token)
    assert payload["sub"] == "42"
    assert payload["role"] == "magasinier"


def test_pin_lockout():
    user_id = 99999  # ID unique pour ce test
    clear_attempts(user_id)

    assert not is_locked_out(user_id)

    for i in range(5):
        record_failed_attempt(user_id)

    assert is_locked_out(user_id)
    clear_attempts(user_id)
    assert not is_locked_out(user_id)


def test_lockout_resets_after_clear():
    user_id = 99998
    clear_attempts(user_id)
    for _ in range(5):
        record_failed_attempt(user_id)
    assert is_locked_out(user_id)
    clear_attempts(user_id)
    assert not is_locked_out(user_id)
