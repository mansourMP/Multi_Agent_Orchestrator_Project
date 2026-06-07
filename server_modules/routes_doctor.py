"""Diagnostic health-check routes for the Sage Doctor service."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from server_modules.auth import enforce_workspace_access
from server_modules.runtime_common import require_api_key
from server_modules.sage_doctor_service import SageDoctorService

router = APIRouter()


@router.get("/sage/doctor/check")
async def sage_doctor_check(
    workspace_id: str = Query(..., min_length=1),
    tenant_id: str = Query("default", min_length=1),
    user_id: str = Query("default", min_length=1),
    current_user=Depends(require_api_key),
):
    """Run all diagnostic checks and return grouped health results as JSON."""
    resolved_workspace_id = enforce_workspace_access(
        current_user,
        workspace_id,
        minimum_role="viewer",
    )
    return SageDoctorService.check_all(
        workspace_id=resolved_workspace_id,
        tenant_id=str(tenant_id or "").strip() or "default",
        user_id=str(user_id or "").strip() or "default",
    )
