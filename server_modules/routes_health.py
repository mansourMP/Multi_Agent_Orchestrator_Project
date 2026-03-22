from fastapi import APIRouter, Depends

from server_modules.runtime_common import require_api_key
from server_modules import health_core as core
from server_modules import health_diagnostics as diagnostics

router = APIRouter()

router.add_api_route("/contract", core.runtime_contract, methods=['GET'])
router.add_api_route("/memory/health", core.memory_health, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/memory/search", core.memory_search, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/memory/upsert", core.memory_upsert, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/health", core.health, methods=['GET'])
router.add_api_route("/mobile/handoff", core.mobile_handoff, methods=['GET'])
router.add_api_route("/validation/latest", core.validation_latest, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/validation/history", core.validation_history, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/doctor", diagnostics.doctor, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/skills/state", diagnostics.get_runtime_skills_state, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/solutions/state", diagnostics.get_runtime_solutions_state, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/skills/state", diagnostics.put_runtime_skills_state, methods=['PUT'], dependencies=[Depends(require_api_key)])
router.add_api_route("/api/solutions/{solution_id}/{subpath:path}", diagnostics.dispatch_installed_solution_api, methods=["GET", "POST", "PUT"], dependencies=[Depends(require_api_key)])
router.add_api_route("/probe", core.probe, methods=['GET'])
router.add_api_route("/setup/sessions", core.create_setup_session, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/setup/sessions/{session_id}", core.get_setup_session, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/setup/sessions/{session_id}/actions", core.setup_session_action, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/setup/sessions/{session_id}/cancel", core.cancel_setup_session, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/setup/sessions/{session_id}/resume", core.resume_setup_session, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/onboarding/sessions", core.create_onboarding_session, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/onboarding/sessions/{session_id}", core.get_onboarding_session, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/onboarding/sessions/{session_id}/actions", core.onboarding_session_action, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/onboarding/sessions/{session_id}/cancel", core.cancel_onboarding_session, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/onboarding/sessions/{session_id}/resume", core.resume_onboarding_session, methods=['POST'], dependencies=[Depends(require_api_key)])
