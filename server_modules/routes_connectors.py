from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from server_modules.runtime_common import require_admin_api_key, require_api_key
from server_modules.runtime_models import ProviderProfileUpsertRequest
from server_modules import connectors_core as core
from server_modules import connectors_actions as actions

router = APIRouter()
admin_deps = [Depends(require_admin_api_key)]

async def provider_profiles(request: Request, body: Optional[ProviderProfileUpsertRequest] = None):
    if request.method.upper() == "GET":
        return await core.list_provider_profiles(
            workspace_id=request.query_params.get("workspace_id"),
            provider=request.query_params.get("provider"),
        )
    if body is None:
        raise HTTPException(status_code=422, detail="Provider profile payload is required.")
    return await core.upsert_provider_profile(body)


router.add_api_route("/providers/profiles", provider_profiles, methods=['GET', 'POST'], dependencies=admin_deps)
router.add_api_route("/providers/profiles/{profile_id}/enable", core.enable_provider_profile, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/providers/profiles/{profile_id}/disable", core.disable_provider_profile, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/providers/profiles/{profile_id}", core.delete_provider_profile, methods=['DELETE'], dependencies=admin_deps)
router.add_api_route("/providers/profiles/health", core.provider_profiles_health, methods=['GET'], dependencies=admin_deps)
router.add_api_route("/tools/contracts", core.get_tool_contracts, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/tools/policy/evaluate", core.evaluate_tools_policy, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/providers", core.list_providers, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/providers/anthropic/local-cli/status", core.get_anthropic_local_cli_status, methods=['GET'], dependencies=admin_deps)
router.add_api_route("/providers/anthropic/local-cli/login", core.start_anthropic_local_cli_login, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/providers/test", core.test_provider_credentials, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/providers/model-aliases", core.get_model_alias_catalog, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/providers/{provider}/models", core.get_provider_models, methods=['GET'], dependencies=admin_deps)
router.add_api_route("/credentials/vault", core.list_credentials_vault, methods=['GET'], dependencies=admin_deps)
router.add_api_route("/connectors", core.list_connectors, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/connectors/vault", core.list_connectors_vault, methods=['GET'], dependencies=admin_deps)
router.add_api_route("/connectors/vault/{connector_id}/microsoft-drive", actions.browse_microsoft_connector_drive, methods=['GET'], dependencies=admin_deps)
router.add_api_route("/connectors/vault/{connector_id}/google-drive", actions.browse_google_connector_drive, methods=['GET'], dependencies=admin_deps)
router.add_api_route("/connectors/vault/{connector_id}/google-doc", actions.create_google_connector_document, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/connectors/vault/{connector_id}/google-sheet", actions.create_google_connector_spreadsheet, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/channels/whatsapp/twilio/webhook", actions.whatsapp_twilio_webhook, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/channels/telegram/autopilot/status", actions.telegram_autopilot_status, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/channels/whatsapp/autopilot/status", actions.whatsapp_autopilot_status, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/channels/autopilot/profiles", actions.list_autopilot_profiles, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/channels/telegram/send", actions.telegram_send_message, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/channels/telegram/autopilot/test-message", actions.telegram_autopilot_test_message, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/connectors/vault", actions.create_connector_vault, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/connectors/vault/{credential_id}", actions.update_connector_vault, methods=['PATCH'], dependencies=admin_deps)
router.add_api_route("/connectors/vault/{credential_id}/test", actions.test_connector_vault, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/connectors/vault/{credential_id}", actions.delete_connector_vault, methods=['DELETE'], dependencies=admin_deps)
router.add_api_route("/credentials/vault", actions.create_vault_credential, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/credentials/vault/{credential_id}", actions.delete_vault_credential, methods=['DELETE'], dependencies=admin_deps)
router.add_api_route("/credentials/vault/{credential_id}/test", actions.test_vault_credential, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/credentials/vault/rotate-key", core.rotate_vault_key, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/credentials/vault/export", core.export_vault_credentials, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/credentials/vault/import", core.import_vault_credentials, methods=['POST'], dependencies=admin_deps)
