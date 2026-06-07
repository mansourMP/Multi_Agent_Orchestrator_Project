"""FastAPI router exposing the Sage Doctor diagnostic endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from server_modules.sage_doctor_service import SageDoctorService

router = APIRouter(prefix="/api")


@router.get("/sage/doctor/check")
async def sage_doctor_check(
    workspace_id: str = Query(""),
    tenant_id: str = Query(""),
):
    """Run the full Sage Doctor diagnostics suite.

    Returns a JSON object with a ``checks`` list and a ``summary`` dict.
    """
    ws = str(workspace_id or "").strip()
    tn = str(tenant_id or "").strip()

    if not ws:
        raise HTTPException(status_code=400, detail="workspace_id is required.")
    if not tn:
        raise HTTPException(status_code=400, detail="tenant_id is required.")

    result = SageDoctorService.check_all(workspace_id=ws, tenant_id=tn)
    return result
