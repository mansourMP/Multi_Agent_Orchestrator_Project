from __future__ import annotations

from contextlib import contextmanager
import importlib
import os

import pytest

import server_modules.auth as auth_module
import server_modules.channel_pairing_service as channel_pairing_service_module
import server_modules.control_plane_repository as control_plane_repository_module
import server_modules.db as db_module
import server_modules.jwt_secret as jwt_secret_module


class _Request:
    headers = {}
    client = None


@contextmanager
def _isolated_modules(monkeypatch: pytest.MonkeyPatch, tmp_path):
    tracked_keys = (
        "EMPYRALIS_STATE_HOME",
        "EMPYRALIS_JWT_SECRET_FILE",
        "DATABASE_URL",
        "ORION_JWT_SECRET",
        "JWT_SECRET",
        "ORION_API_KEY",
        "RUNTIME_KEY",
    )
    original_env = {key: os.environ.get(key) for key in tracked_keys}
    state_home = tmp_path / "state"
    monkeypatch.setenv("EMPYRALIS_STATE_HOME", str(state_home))
    monkeypatch.delenv("EMPYRALIS_JWT_SECRET_FILE", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    for key in ("ORION_JWT_SECRET", "JWT_SECRET", "ORION_API_KEY", "RUNTIME_KEY"):
        monkeypatch.delenv(key, raising=False)
    runtime_db = importlib.reload(db_module)
    runtime_db._POOLS_BY_LOOP.clear()
    runtime_db._ENV_DSN_LOADED = True
    importlib.reload(control_plane_repository_module)
    jwt_secret = importlib.reload(jwt_secret_module)
    auth = importlib.reload(auth_module)
    pairing = importlib.reload(channel_pairing_service_module)
    auth.USER_RATE_LIMIT_BUCKETS.clear()
    auth.LOGIN_RATE_LIMIT_BUCKETS.clear()
    try:
        yield auth, pairing, jwt_secret
    finally:
        for key, value in original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        runtime_db = importlib.reload(db_module)
        runtime_db._POOLS_BY_LOOP.clear()
        importlib.reload(jwt_secret_module)
        importlib.reload(control_plane_repository_module)
        importlib.reload(auth_module)
        importlib.reload(channel_pairing_service_module)


def _current_user(auth, token: str):
    return auth.get_current_user(_Request(), authorization=f"Bearer {token}")


def test_create_intent_and_pair_authorizes_same_workspace(monkeypatch: pytest.MonkeyPatch, tmp_path):
    with _isolated_modules(monkeypatch, tmp_path) as (auth, pairing_module, _):
        created = auth.register_user("pair@example.com", "password-123", name="Pair User")
        current_user = _current_user(auth, created["token"])
        workspace_id = created["current_workspace_id"]

        intent_payload = pairing_module.create_authenticated_channel_pairing_intent(
            current_user,
            provider="telegram",
            workspace_id="default",
        )
        pairing_code = intent_payload["intent"]["pairing_code"]

        pair_result = pairing_module.get_channel_pairing_service().authorize_channel_message(
            provider="telegram",
            external_subject="telegram-user-1",
            workspace_id=workspace_id,
            message_text=f"/pair {pairing_code}",
            observed_metadata={"connector_id": "conn-1"},
        )
        assert pair_result["status"] == "paired"

        linked = pairing_module.get_channel_pairing_service().authorize_channel_message(
            provider="telegram",
            external_subject="telegram-user-1",
            workspace_id=workspace_id,
            message_text="hello",
        )
        assert linked["authorized"] is True
        assert linked["workspace_id"] == workspace_id


def test_external_identity_cannot_silently_drift_between_accounts(monkeypatch: pytest.MonkeyPatch, tmp_path):
    with _isolated_modules(monkeypatch, tmp_path) as (auth, pairing_module, _):
        user_one = auth.register_user("owner.one@example.com", "password-123", name="Owner One")
        user_two = auth.register_user("owner.two@example.com", "password-123", name="Owner Two")
        current_user_one = _current_user(auth, user_one["token"])
        current_user_two = _current_user(auth, user_two["token"])
        workspace_one = user_one["current_workspace_id"]
        workspace_two = user_two["current_workspace_id"]

        first_intent = pairing_module.create_authenticated_channel_pairing_intent(
            current_user_one,
            provider="whatsapp",
            workspace_id="default",
        )
        first_code = first_intent["intent"]["pairing_code"]
        first_result = pairing_module.get_channel_pairing_service().authorize_channel_message(
            provider="whatsapp",
            external_subject="whatsapp:+15550001",
            workspace_id=workspace_one,
            message_text=f"pair {first_code}",
        )
        assert first_result["status"] == "paired"
        assert "whatsapp:opt_in" in (first_result["link"].get("scopes") or [])

        second_intent = pairing_module.create_authenticated_channel_pairing_intent(
            current_user_two,
            provider="whatsapp",
            workspace_id="default",
        )
        blocked = pairing_module.get_channel_pairing_service().authorize_channel_message(
            provider="whatsapp",
            external_subject="whatsapp:+15550001",
            workspace_id=workspace_two,
            message_text=f"pair {second_intent['intent']['pairing_code']}",
        )
        assert blocked["authorized"] is False
        assert blocked["status"] == "pairing_failed"
        assert "already linked" in blocked["reply_text"].lower()

        relink_intent = pairing_module.create_authenticated_channel_pairing_intent(
            current_user_two,
            provider="whatsapp",
            workspace_id="default",
            allow_relink=True,
        )
        relinked = pairing_module.get_channel_pairing_service().authorize_channel_message(
            provider="whatsapp",
            external_subject="whatsapp:+15550001",
            workspace_id=workspace_two,
            message_text=f"pair {relink_intent['intent']['pairing_code']}",
        )
        assert relinked["status"] == "paired"

        resolved = pairing_module.get_channel_pairing_service().resolve_channel_link(
            provider="whatsapp",
            external_subject="whatsapp:+15550001",
        )
        assert resolved["workspace_id"] == workspace_two


def test_list_and_revoke_channel_links(monkeypatch: pytest.MonkeyPatch, tmp_path):
    with _isolated_modules(monkeypatch, tmp_path) as (auth, pairing_module, _):
        created = auth.register_user("revoke@example.com", "password-123", name="Revoke User")
        current_user = _current_user(auth, created["token"])
        workspace_id = created["current_workspace_id"]

        intent = pairing_module.create_authenticated_channel_pairing_intent(
            current_user,
            provider="discord",
            workspace_id="default",
        )
        pairing_module.get_channel_pairing_service().authorize_channel_message(
            provider="discord",
            external_subject="discord-user-9",
            workspace_id=workspace_id,
            message_text=f"pair {intent['intent']['pairing_code']}",
        )

        listed = pairing_module.list_authenticated_channel_links(current_user)
        assert len(listed["links"]) == 1
        link_id = listed["links"][0]["link_id"]

        revoked = pairing_module.revoke_authenticated_channel_link(
            current_user,
            link_id=link_id,
            confirm=True,
        )
        assert revoked["link"]["status"] == "revoked"

        active = pairing_module.list_authenticated_channel_links(current_user)
        assert active["links"] == []

        all_links = pairing_module.list_authenticated_channel_links(current_user, include_revoked=True)
        assert len(all_links["links"]) == 1
        assert all_links["links"][0]["status"] == "revoked"
