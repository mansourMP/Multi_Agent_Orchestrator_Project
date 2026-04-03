from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from server_modules.auth import enforce_workspace_access
from server_modules.runtime_common import require_admin_api_key, require_api_key
from server_modules.runtime_models import (
    ConnectorPatchRequest,
    CredentialUpsertRequest,
    ProviderProfileUpsertRequest,
    ToolContractUpdateRequest,
    VaultExportRequest,
    VaultImportRequest,
)
from server_modules import connectors_core as core
from server_modules import connectors_actions as actions
from server_modules.provider_profiles import normalize_provider_id, resolve_provider_adapter, resolve_vault_credential
from server_modules.schemas import ConnectorCreate, ConnectorDocumentCreateRequest, ConnectorSpreadsheetCreateRequest

router = APIRouter()
admin_deps = [Depends(require_admin_api_key)]

async def provider_profiles(
    request: Request,
    body: Optional[ProviderProfileUpsertRequest] = None,
    current_user=Depends(require_admin_api_key),
):
    if request.method.upper() == "GET":
        workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
        return await core.list_provider_profiles(
            workspace_id=workspace_id,
            provider=request.query_params.get("provider"),
        )
    if body is None:
        raise HTTPException(status_code=422, detail="Provider profile payload is required.")
    body.workspace_id = enforce_workspace_access(current_user, body.workspace_id)
    return await core.upsert_provider_profile(body)


async def provider_profiles_health(
    request: Request,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    return await core.provider_profiles_health(workspace_id=workspace_id)


async def providers_health_check(
    request: Request,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    payload = await core.list_credentials_vault(workspace_id=workspace_id)
    items = payload.get("items") if isinstance(payload, dict) else []
    results: Dict[str, str] = {}
    for item in items if isinstance(items, list) else []:
        provider_id = normalize_provider_id(item.get("provider"))
        credential_id = str(item.get("id") or "").strip()
        if not provider_id or not credential_id:
            continue
        try:
            credentials = resolve_vault_credential(credential_id, workspace_id)
            _provider, _adapter_key, adapter = resolve_provider_adapter(provider_id, credentials)
            check = adapter.validate(credentials)
            status = int(check.get("status") or 500)
            state = "ok" if bool(check.get("ok")) else f"failed: {status}"
        except Exception as exc:
            state = f"failed: {str(exc).strip() or 'validation error'}"
        if state == "ok" or provider_id not in results:
            results[provider_id] = state
    return results


async def update_tool_contract(
    request: Request,
    tool_id: str,
    body: ToolContractUpdateRequest,
    current_user=Depends(require_admin_api_key),
):
    if body is None:
        raise HTTPException(status_code=422, detail="Tool contract payload is required.")
    return await core.update_tool_contract_state(tool_id, body.enabled)


async def list_credentials_vault(
    request: Request,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    return await core.list_credentials_vault(workspace_id=workspace_id)


async def list_connectors_vault(
    request: Request,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    return await core.list_connectors_vault(workspace_id=workspace_id)


async def browse_microsoft_connector_drive(
    request: Request,
    connector_id: str,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    return await actions.browse_microsoft_connector_drive(
        connector_id=connector_id,
        workspace_id=workspace_id,
        path=request.query_params.get("path"),
    )


async def browse_google_connector_drive(
    request: Request,
    connector_id: str,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    return await actions.browse_google_connector_drive(
        connector_id=connector_id,
        workspace_id=workspace_id,
        path=request.query_params.get("path"),
    )


async def create_google_connector_document(
    request: Request,
    connector_id: str,
    body: Optional[ConnectorDocumentCreateRequest] = None,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    return await actions.create_google_connector_document(
        connector_id=connector_id,
        body=body,
        workspace_id=workspace_id,
    )


async def create_google_connector_spreadsheet(
    request: Request,
    connector_id: str,
    body: Optional[ConnectorSpreadsheetCreateRequest] = None,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    return await actions.create_google_connector_spreadsheet(
        connector_id=connector_id,
        body=body,
        workspace_id=workspace_id,
    )


async def create_connector_vault(
    request: Request,
    body: ConnectorCreate,
    current_user=Depends(require_admin_api_key),
):
    body.workspace_id = enforce_workspace_access(current_user, body.workspace_id)
    return await actions.create_connector_vault(body)


async def update_connector_vault(
    request: Request,
    credential_id: str,
    body: ConnectorPatchRequest,
    current_user=Depends(require_admin_api_key),
):
    body.workspace_id = enforce_workspace_access(current_user, body.workspace_id)
    return await actions.update_connector_vault(credential_id, body)


async def test_connector_vault(
    request: Request,
    credential_id: str,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    return await actions.test_connector_vault(credential_id, workspace_id=workspace_id)


async def delete_connector_vault(
    request: Request,
    credential_id: str,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    return await actions.delete_connector_vault(credential_id, workspace_id=workspace_id)


async def create_vault_credential(
    request: Request,
    body: CredentialUpsertRequest,
    current_user=Depends(require_admin_api_key),
):
    body.workspace_id = enforce_workspace_access(current_user, body.workspace_id)
    return await actions.create_vault_credential(body)


async def delete_vault_credential(
    request: Request,
    credential_id: str,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    return await actions.delete_vault_credential(credential_id, workspace_id=workspace_id)


async def test_vault_credential(
    request: Request,
    credential_id: str,
    current_user=Depends(require_admin_api_key),
):
    workspace_id = enforce_workspace_access(current_user, request.query_params.get("workspace_id"))
    return await actions.test_vault_credential(credential_id, workspace_id=workspace_id)


async def export_vault_credentials(
    body: VaultExportRequest,
    current_user=Depends(require_admin_api_key),
):
    body.workspace_id = enforce_workspace_access(current_user, body.workspace_id)
    return await core.export_vault_credentials(body)


async def import_vault_credentials(
    body: VaultImportRequest,
    current_user=Depends(require_admin_api_key),
):
    body.workspace_id = enforce_workspace_access(current_user, body.workspace_id)
    return await core.import_vault_credentials(body)


router.add_api_route("/providers/profiles", provider_profiles, methods=['GET', 'POST'])
router.add_api_route("/providers/profiles/{profile_id}/enable", core.enable_provider_profile, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/providers/profiles/{profile_id}/disable", core.disable_provider_profile, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/providers/profiles/{profile_id}", core.delete_provider_profile, methods=['DELETE'], dependencies=admin_deps)
router.add_api_route("/providers/profiles/health", provider_profiles_health, methods=['GET'])
router.add_api_route("/tools/contracts", core.get_tool_contracts, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/tools/contracts/{tool_id}", update_tool_contract, methods=['PUT'], dependencies=admin_deps)
router.add_api_route("/tools/policy/evaluate", core.evaluate_tools_policy, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/providers", core.list_providers, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/providers/anthropic/local-cli/status", core.get_anthropic_local_cli_status, methods=['GET'], dependencies=admin_deps)
router.add_api_route("/providers/anthropic/local-cli/login", core.start_anthropic_local_cli_login, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/providers/gemini/local-cli/status", core.get_gemini_local_cli_status, methods=['GET'], dependencies=admin_deps)
router.add_api_route("/providers/test", core.test_provider_credentials, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/providers/health-check", providers_health_check, methods=['GET'], dependencies=admin_deps)
router.add_api_route("/providers/model-aliases", core.get_model_alias_catalog, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/providers/{provider}/probe", core.probe_provider, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/providers/{provider}/models", core.get_provider_models, methods=['GET'], dependencies=admin_deps)
router.add_api_route("/credentials/vault", list_credentials_vault, methods=['GET'])
router.add_api_route("/connectors", core.list_connectors, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/connectors/vault", list_connectors_vault, methods=['GET'])
router.add_api_route("/connectors/vault/{connector_id}/microsoft-drive", browse_microsoft_connector_drive, methods=['GET'])
router.add_api_route("/connectors/vault/{connector_id}/google-drive", browse_google_connector_drive, methods=['GET'])
router.add_api_route("/connectors/vault/{connector_id}/google-doc", create_google_connector_document, methods=['POST'])
router.add_api_route("/connectors/vault/{connector_id}/google-sheet", create_google_connector_spreadsheet, methods=['POST'])
router.add_api_route("/channels/whatsapp/twilio/webhook", actions.whatsapp_twilio_webhook, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/channels/slack/events", actions.slack_events_webhook, methods=['POST'])
router.add_api_route("/channels/github/webhook", actions.github_events_webhook, methods=['POST'])
router.add_api_route("/connectors/discord/webhook", actions.discord_webhook, methods=['POST'])
router.add_api_route("/channels/telegram/autopilot/status", actions.telegram_autopilot_status, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/channels/whatsapp/autopilot/status", actions.whatsapp_autopilot_status, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/channels/autopilot/profiles", actions.list_autopilot_profiles, methods=['GET'], dependencies=[Depends(require_api_key)])
router.add_api_route("/channels/telegram/send", actions.telegram_send_message, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/channels/telegram/autopilot/test-message", actions.telegram_autopilot_test_message, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/connectors/slack/oauth/callback", actions.slack_oauth_callback, methods=['POST'], dependencies=[Depends(require_api_key)])
router.add_api_route("/connectors/vault", create_connector_vault, methods=['POST'])
router.add_api_route("/connectors/vault/{credential_id}", update_connector_vault, methods=['PATCH'])
router.add_api_route("/connectors/vault/{credential_id}/test", test_connector_vault, methods=['POST'])
router.add_api_route("/connectors/vault/{credential_id}", delete_connector_vault, methods=['DELETE'])
router.add_api_route("/credentials/vault", create_vault_credential, methods=['POST'])
router.add_api_route("/credentials/vault/{credential_id}", delete_vault_credential, methods=['DELETE'])
router.add_api_route("/credentials/vault/{credential_id}/test", test_vault_credential, methods=['POST'])
router.add_api_route("/credentials/vault/rotate-key", core.rotate_vault_key, methods=['POST'], dependencies=admin_deps)
router.add_api_route("/credentials/vault/export", export_vault_credentials, methods=['POST'])
router.add_api_route("/credentials/vault/import", import_vault_credentials, methods=['POST'])
