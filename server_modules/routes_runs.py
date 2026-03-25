from fastapi import APIRouter, Depends
from server_modules.runtime_events_api import register_inbox_routes
from server_modules.runtime_runs_api import register_run_routes
from server_modules.runtime_runtime_api import register_runtime_routes
from server_modules.runtime_common import require_api_key
from server_modules import runs_core as core
from server_modules import runs_history as history

router = APIRouter()

register_run_routes(router)
register_inbox_routes(router)
register_runtime_routes(router)

router.add_api_route("/cognitive/approvals", history.list_cognitive_approvals, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/cognitive/approvals/{event_id}/resolve", history.resolve_cognitive_approval, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/approvals/audit", history.get_approval_audit, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/approvals", history.list_pending_approvals, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/audit", history.get_audit, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/schedules/weekly", core.list_weekly_schedules, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/schedules/weekly", core.create_weekly_schedule, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/schedules/weekly/{schedule_id}", core.update_weekly_schedule, methods=['PATCH'], dependencies=[Depends(require_api_key)])
router.add_api_route("/schedules/weekly/{schedule_id}", core.delete_weekly_schedule, methods=['DELETE'], dependencies=[Depends(require_api_key)])
router.add_api_route("/schedules/weekly/{schedule_id}/run-now", core.trigger_weekly_schedule_now, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/metrics", core.get_runtime_metrics, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/kpis", core.get_runtime_kpis, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/runs/queue/local", core.get_local_run_queue, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/local/workers/status", core.get_local_workers_status, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/local/workers/{worker_id}/heartbeat", core.heartbeat_local_worker, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/local/runs/claim", core.claim_local_run, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/local/runs/{run_id}/heartbeat", core.heartbeat_local_run, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/local/runs/{run_id}/complete", core.complete_local_run, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/local/runs/{run_id}/fail", core.fail_local_run, methods=['POST'], dependencies=[Depends(require_api_key)])
