"""
Credential vault storage + encryption helpers.

Extracted from server.py to reduce hotspot size.
All function signatures and behaviour are unchanged.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import secrets
from pathlib import Path
from typing import Any, Dict

_server = None  # populated by _init()
_LOCAL_ENV_TOKENS = {"", "dev", "development", "local", "test", "testing"}
LOGGER = logging.getLogger(__name__)


def _init():
    """Late-bind references to server.py globals. Called on first use."""
    global _server
    if _server is not None:
        return
    import server as _s
    _server = _s


def _safe_write_json(path: Path, payload: Dict[str, Any]):
    _init()
    return _server._safe_write_json(path, payload)


def _resolved_environment() -> str:
    return str(os.getenv("ORION_ENV") or os.getenv("ENV") or "").strip().lower()


def _vault_requires_explicit_env_key() -> bool:
    return _resolved_environment() not in _LOCAL_ENV_TOKENS


def _vault_passphrase() -> str:
    _init()
    vault_key_env = _server.VAULT_KEY_ENV
    vault_key_file = _server.VAULT_KEY_FILE
    if vault_key_env and vault_key_env.strip():
        return vault_key_env.strip()
    if _vault_requires_explicit_env_key():
        raise RuntimeError("CREDENTIAL_VAULT_KEY is required outside local development environments.")

    if not vault_key_file.exists():
        key_parent = vault_key_file.parent if vault_key_file.parent != Path("") else Path(".")
        key_parent.mkdir(parents=True, exist_ok=True)
        vault_key_file.write_text(secrets.token_urlsafe(64), encoding="utf-8")
        try:
            os.chmod(vault_key_file, 0o600)
        except Exception:
            pass
    return vault_key_file.read_text(encoding="utf-8").strip()


def _set_vault_passphrase(passphrase: str):
    _init()
    vault_key_env = _server.VAULT_KEY_ENV
    vault_key_file = _server.VAULT_KEY_FILE
    if vault_key_env and vault_key_env.strip():
        raise RuntimeError("Cannot rotate vault key while CREDENTIAL_VAULT_KEY env var is set.")
    key_parent = vault_key_file.parent if vault_key_file.parent != Path("") else Path(".")
    key_parent.mkdir(parents=True, exist_ok=True)
    vault_key_file.write_text(passphrase.strip(), encoding="utf-8")
    try:
        os.chmod(vault_key_file, 0o600)
    except Exception:
        pass


def _vault_crypto_primitives():
    try:
        from cryptography.fernet import Fernet, InvalidToken
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    except Exception as exc:
        raise RuntimeError(
            "Credential vault encryption backend unavailable. Install Python package 'cryptography'."
        ) from exc
    return Fernet, InvalidToken, hashes, PBKDF2HMAC


def _vault_derive_key(passphrase: str, salt: bytes, iterations: int) -> bytes:
    value = str(passphrase or "").strip()
    if not value:
        raise RuntimeError("Vault passphrase is empty.")
    _, _, hashes, PBKDF2HMAC = _vault_crypto_primitives()
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iterations,
    )
    return base64.urlsafe_b64encode(kdf.derive(value.encode("utf-8")))


def _legacy_openssl_encrypt_with_passphrase(plaintext: str, passphrase: str) -> str:
    raise RuntimeError(
        "Legacy OpenSSL vault encryption is disabled because it exposed secrets through process arguments."
    )


def _legacy_openssl_decrypt_with_passphrase(ciphertext: str, passphrase: str) -> str:
    raise RuntimeError(
        "Legacy OpenSSL vault decryption is disabled. Re-encrypt credentials with the current vault format."
    )


def _vault_encrypt_with_passphrase(plaintext: str, passphrase: str) -> str:
    _init()
    if not isinstance(plaintext, str):
        raise RuntimeError("Vault encryption expects a plaintext string.")
    iterations = _server.ORION_VAULT_KDF_ITERATIONS
    salt = secrets.token_bytes(16)
    key = _vault_derive_key(passphrase, salt, iterations)
    Fernet, _, _, _ = _vault_crypto_primitives()
    token = Fernet(key).encrypt(plaintext.encode("utf-8")).decode("utf-8")
    payload = {
        "v": 2,
        "alg": "fernet-pbkdf2-sha256",
        "iter": iterations,
        "salt": base64.urlsafe_b64encode(salt).decode("ascii"),
        "ct": token,
    }
    encoded_payload = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    return f"{_server.ORION_VAULT_CIPHER_PREFIX}{encoded_payload}"


def _vault_decrypt_v2_with_passphrase(ciphertext: str, passphrase: str) -> str:
    _init()
    if not ciphertext.startswith(_server.ORION_VAULT_CIPHER_PREFIX):
        raise RuntimeError("Unsupported vault ciphertext format.")
    encoded_payload = ciphertext[len(_server.ORION_VAULT_CIPHER_PREFIX):].strip()
    try:
        payload_raw = base64.urlsafe_b64decode(encoded_payload.encode("ascii"))
        payload = json.loads(payload_raw.decode("utf-8"))
    except Exception as exc:
        raise RuntimeError("Vault ciphertext payload is invalid.") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Vault ciphertext version is invalid.")
    try:
        payload_version = int(payload.get("v") or 0)
    except Exception as exc:
        raise RuntimeError("Vault ciphertext version is invalid.") from exc
    if payload_version != 2:
        raise RuntimeError("Vault ciphertext version is invalid.")
    salt_value = str(payload.get("salt") or "").strip()
    token = str(payload.get("ct") or "").strip()
    if not salt_value or not token:
        raise RuntimeError("Vault ciphertext payload is incomplete.")
    try:
        salt = base64.urlsafe_b64decode(salt_value.encode("ascii"))
    except Exception as exc:
        raise RuntimeError("Vault ciphertext salt is invalid.") from exc
    try:
        iterations = int(payload.get("iter") or _server.ORION_VAULT_KDF_ITERATIONS)
    except Exception as exc:
        raise RuntimeError("Vault ciphertext KDF iterations are invalid.") from exc
    if iterations < 120000 or iterations > 3000000:
        raise RuntimeError("Vault ciphertext KDF iterations are out of policy range.")
    key = _vault_derive_key(passphrase, salt, iterations)
    Fernet, InvalidToken, _, _ = _vault_crypto_primitives()
    try:
        plain = Fernet(key).decrypt(token.encode("utf-8"))
    except InvalidToken as exc:
        raise RuntimeError("Vault decryption failed. Invalid passphrase or ciphertext.") from exc
    return plain.decode("utf-8")


def _openssl_encrypt_with_passphrase(plaintext: str, passphrase: str) -> str:
    _init()
    return _vault_encrypt_with_passphrase(plaintext, passphrase)


def _openssl_decrypt_with_passphrase(ciphertext: str, passphrase: str) -> str:
    _init()
    value = str(ciphertext or "").strip()
    if value.startswith(_server.ORION_VAULT_CIPHER_PREFIX):
        return _vault_decrypt_v2_with_passphrase(value, passphrase)
    raise RuntimeError("Legacy OpenSSL vault decrypt is disabled.")


def _openssl_encrypt(plaintext: str) -> str:
    return _openssl_encrypt_with_passphrase(plaintext, _vault_passphrase())


def _openssl_decrypt(ciphertext: str) -> str:
    return _openssl_decrypt_with_passphrase(ciphertext, _vault_passphrase())


def load_vault() -> Dict[str, Any]:
    _init()
    vault_file = _server.VAULT_FILE
    if not vault_file.exists():
        return {"version": 1, "credentials": []}
    try:
        raw = vault_file.read_text(encoding="utf-8")
        data = json.loads(raw) if raw else {}
        if not isinstance(data, dict):
            return {"version": 1, "credentials": []}
        creds = data.get("credentials")
        if not isinstance(creds, list):
            creds = []
        return {"version": data.get("version", 1), "credentials": creds}
    except Exception as exc:
        LOGGER.warning("Failed to load credential vault from configured path: %s", exc)
        return {"version": 1, "credentials": []}


def save_vault(vault: Dict[str, Any]):
    _init()
    vault_file = _server.VAULT_FILE
    safe_vault = {
        "version": vault.get("version", 1),
        "credentials": vault.get("credentials", []),
    }
    _safe_write_json(vault_file, safe_vault)
    try:
        os.chmod(vault_file, 0o600)
    except Exception:
        pass
