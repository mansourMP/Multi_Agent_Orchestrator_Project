#!/bin/sh
set -eu

cd "$(dirname "$0")/../.."

export ORION_PUBLIC_REGISTRATION_ENABLED=1
export ORION_ADMIN_EMAILS=owner@example.com

./venv/bin/python - <<'PY'
import asyncio

from fastapi import HTTPException

from server_modules import auth, control_plane_repository

EMAIL = "owner@example.com"
PASSWORD = "password-123"
NAME = "E2E Owner"
WORKSPACE_ID = "ws-1"
TENANT_ID = "tenant-1"


def ensure_owner_user() -> dict:
    user = auth._find_user_by_email(EMAIL)
    if user is None:
        try:
            auth.register_user(
                EMAIL,
                PASSWORD,
                name=NAME,
                channel="web",
                workspace_id=WORKSPACE_ID,
            )
        except HTTPException as error:
            if error.status_code != 409:
                raise
        user = auth._find_user_by_email(EMAIL)
    if user is None:
        raise RuntimeError("Unable to seed Playwright owner account.")
    return user


async def ensure_workspace(user: dict) -> None:
    await control_plane_repository.ensure_workspace_membership(
        user_id=str(user.get("id") or "").strip(),
        email=EMAIL,
        display_name=str(user.get("name") or NAME).strip() or NAME,
        tenant_id=TENANT_ID,
        workspace_id=WORKSPACE_ID,
        role="owner",
        password_hash=auth._hash_password(PASSWORD),
    )
    await control_plane_repository.update_workspace_profile(
        WORKSPACE_ID,
        {
            "name": "E2E Workspace",
            "preferred_shell_profile": "personal_shell",
            "default_route": f"/w/{WORKSPACE_ID}/chat",
            "setup_completed": True,
        },
    )


asyncio.run(ensure_workspace(ensure_owner_user()))
PY

exec env FRONTEND_ORIGINS='http://127.0.0.1:3000,http://localhost:3000' ./venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
