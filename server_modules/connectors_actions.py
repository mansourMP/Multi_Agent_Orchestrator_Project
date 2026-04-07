from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from server_modules.connectors.github_connector import (
    parse_inbound_event as github_parse_inbound_event,
    verify_request_signature as github_verify_request_signature,
)
from server_modules.connectors.discord_connector import (
    dispatch_inbound_event as discord_dispatch_inbound_event,
    event_matches_connector as discord_event_matches_connector,
    parse_inbound_event as discord_parse_inbound_event,
    verify_interaction_signature as discord_verify_interaction_signature,
)
from server_modules.connectors.slack_connector import (
    exchange_oauth_code as slack_exchange_oauth_code,
    get_channel_history as slack_get_channel_history,
    list_channels as slack_list_channels,
    parse_inbound_event as slack_parse_inbound_event,
    send_dm as slack_send_dm_message,
    send_message as slack_send_channel_message,
    verify_request_signature as slack_verify_request_signature,
)
from server_modules.schemas import ConnectorCreate, ConnectorDocumentCreateRequest, ConnectorSpreadsheetCreateRequest
from server_modules.tool_availability_truth import capability_verification_metadata

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})

async def browse_microsoft_connector_drive(
    connector_id: str,
    workspace_id: Optional[str] = None,
    path: Optional[str] = None,
):
    try:
        secret = resolve_vault_credential(connector_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if str(secret.get("_provider") or "").strip() != "microsoft_365":
        raise HTTPException(status_code=400, detail="Connector is not Microsoft 365.")

    try:
        listing = microsoft_365_list_drive_children(
            secret,
            http_json_request,
            path=str(path or ""),
            top=50,
        )
        return {
            "ok": True,
            "path": listing.get("path") or "onedrive:/",
            "items": listing.get("items") if isinstance(listing.get("items"), list) else [],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

async def browse_google_connector_drive(
    connector_id: str,
    workspace_id: Optional[str] = None,
    path: Optional[str] = None,
):
    try:
        secret = resolve_vault_credential(connector_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if str(secret.get("_provider") or "").strip() != "google_workspace":
        raise HTTPException(status_code=400, detail="Connector is not Google Workspace.")

    try:
        listing = google_workspace_list_drive_children(
            secret,
            path=str(path or ""),
            top=50,
        )
        return {
            "ok": True,
            "path": listing.get("path") or "gdrive:/",
            "items": listing.get("items") if isinstance(listing.get("items"), list) else [],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

async def create_google_connector_document(
    connector_id: str,
    body: Optional[ConnectorDocumentCreateRequest] = None,
    workspace_id: Optional[str] = None,
):
    try:
        secret = resolve_vault_credential(connector_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if str(secret.get("_provider") or "").strip() != "google_workspace":
        raise HTTPException(status_code=400, detail="Connector is not Google Workspace.")

    payload = {}
    if body is not None:
        payload = body.model_dump() if hasattr(body, "model_dump") else body.dict()
    title = str(payload.get("title") or "").strip() or f"Empyralis Doc {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
    try:
        created = google_workspace_create_document(secret, title)
        document_id = str(created.get("documentId") or "").strip()
        web_url = f"https://docs.google.com/document/d/{document_id}/edit" if document_id else None
        return {
            "ok": True,
            "title": title,
            "documentId": document_id or None,
            "webUrl": web_url,
            "raw": created,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

async def create_google_connector_spreadsheet(
    connector_id: str,
    body: Optional[ConnectorSpreadsheetCreateRequest] = None,
    workspace_id: Optional[str] = None,
):
    try:
        secret = resolve_vault_credential(connector_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if str(secret.get("_provider") or "").strip() != "google_workspace":
        raise HTTPException(status_code=400, detail="Connector is not Google Workspace.")

    payload = {}
    if body is not None:
        payload = body.model_dump() if hasattr(body, "model_dump") else body.dict()
    title = str(payload.get("title") or "").strip() or f"Empyralis Sheet {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
    try:
        created = google_workspace_create_spreadsheet(secret, title)
        spreadsheet_id = str(created.get("spreadsheetId") or "").strip()
        web_url = str(created.get("spreadsheetUrl") or "").strip() or (
            f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit" if spreadsheet_id else ""
        )
        return {
            "ok": True,
            "title": title,
            "spreadsheetId": spreadsheet_id or None,
            "webUrl": web_url or None,
            "raw": created,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

async def whatsapp_twilio_webhook(request: Request):
    return await handle_whatsapp_twilio_webhook(request)

async def telegram_autopilot_status():
    return await handle_telegram_autopilot_status()

async def whatsapp_autopilot_status():
    return await handle_whatsapp_autopilot_status()

async def list_autopilot_profiles():
    return await handle_list_autopilot_profiles()

async def telegram_send_message(body: TelegramSendRequest):
    body.validate_fields()
    try:
        return await handle_telegram_send_message(
            text=body.text,
            workspace_id=body.workspace_id,
            session_key=body.session_key,
            chat_id=body.chat_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

async def telegram_autopilot_test_message(body: TelegramAutopilotTestRequest):
    body.validate_fields()
    try:
        return await handle_telegram_autopilot_test_message(
            text=body.text,
            workspace_id=body.workspace_id,
            session_key=body.session_key,
            chat_id=body.chat_id,
            connector_id=body.connector_id,
            sender_id=body.sender_id,
            timeout_seconds=body.timeout_seconds,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _upsert_slack_oauth_connector_entry(
    *,
    workspace_id: Optional[str],
    label: str,
    credentials: Dict[str, Any],
    metadata: Optional[Dict[str, Any]],
    test_result: Dict[str, Any],
) -> Dict[str, Any]:
    now = datetime.utcnow().isoformat() + "Z"
    connector = "slack"
    safe_metadata = dict(metadata or {})
    team = test_result.get("team") if isinstance(test_result.get("team"), dict) else {}
    bot = test_result.get("bot") if isinstance(test_result.get("bot"), dict) else {}
    authed_user = test_result.get("authed_user") if isinstance(test_result.get("authed_user"), dict) else {}
    connector_metadata = {
        **_connector_public_metadata(connector, credentials),
        **safe_metadata,
    }
    connector_metadata["capability_verification"] = capability_verification_metadata(connector, test_result)
    if str(team.get("id") or "").strip():
        connector_metadata["team_id"] = str(team.get("id")).strip()
    if str(team.get("name") or "").strip():
        connector_metadata["team_name"] = str(team.get("name")).strip()
    if str(bot.get("user_id") or "").strip():
        connector_metadata["bot_user_id"] = str(bot.get("user_id")).strip()
    if str(bot.get("bot_status") or "").strip():
        connector_metadata["bot_status"] = str(bot.get("bot_status")).strip()
    if str(authed_user.get("id") or "").strip():
        connector_metadata["authed_user_id"] = str(authed_user.get("id")).strip()

    vault = load_vault()
    items = vault.get("credentials", [])
    if not isinstance(items, list):
        items = []
    duplicate = _find_duplicate_connector_entry(connector, credentials, workspace_id)
    entry_id = str((duplicate or {}).get("id") or uuid.uuid4()).strip()
    created_at = str((duplicate or {}).get("created_at") or now).strip() or now
    found = False
    next_items: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            next_items.append(item)
            continue
        if str(item.get("id") or "").strip() != entry_id:
            next_items.append(item)
            continue
        found = True
        next_items.append(
            {
                **item,
                "label": label.strip() or str(item.get("label") or "Slack").strip() or "Slack",
                "provider": connector,
                "workspace_id": _normalize_workspace_id(workspace_id),
                "mode": "connector",
                "metadata": _sanitize_connector_metadata(connector_metadata),
                "created_at": created_at,
                "updated_at": now,
                "encrypted_secret": _openssl_encrypt(json.dumps(credentials, separators=(",", ":"))),
            }
        )
    if not found:
        next_items.append(
            {
                "id": entry_id,
                "label": label.strip() or str(team.get("name") or "Slack").strip() or "Slack",
                "provider": connector,
                "workspace_id": _normalize_workspace_id(workspace_id),
                "mode": "connector",
                "metadata": _sanitize_connector_metadata(connector_metadata),
                "created_at": created_at,
                "updated_at": now,
                "encrypted_secret": _openssl_encrypt(json.dumps(credentials, separators=(",", ":"))),
            }
        )
    vault["credentials"] = next_items
    save_vault(vault)

    return {
        "id": entry_id,
        "label": label.strip() or str(team.get("name") or "Slack").strip() or "Slack",
        "connector": connector,
        "workspace_id": _normalize_workspace_id(workspace_id),
        "metadata": _sanitize_connector_metadata(connector_metadata),
        "created_at": created_at,
        "updated_at": now,
        "test": test_result,
    }


async def slack_oauth_callback(request: Request):
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}

    code = str(payload.get("code") or "").strip()
    redirect_uri = str(payload.get("redirect_uri") or "").strip()
    workspace_id = _normalize_workspace_id(payload.get("workspace_id"))
    label = str(payload.get("label") or "Slack").strip() or "Slack"
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    if not code:
        raise HTTPException(status_code=400, detail="Slack OAuth code is required.")
    if not redirect_uri:
        raise HTTPException(status_code=400, detail="Slack redirect_uri is required.")

    try:
        exchange = slack_exchange_oauth_code(code, redirect_uri, http_json_request=http_json_request)
        credentials = exchange.get("credentials") if isinstance(exchange.get("credentials"), dict) else {}
        test = validate_slack_connector(credentials)
        persisted_credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else credentials
        result = _upsert_slack_oauth_connector_entry(
            workspace_id=workspace_id,
            label=label,
            credentials=persisted_credentials,
            metadata=metadata,
            test_result=test,
        )
        return {"ok": True, **result}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


async def slack_events_webhook(request: Request):
    raw_body = await request.body()
    headers = dict(request.headers.items())
    try:
        if not slack_verify_request_signature(headers, raw_body):
            raise HTTPException(status_code=401, detail="Slack request signature is invalid.")
        payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        parsed = slack_parse_inbound_event(payload if isinstance(payload, dict) else {})
        if parsed.get("kind") == "url_verification":
            return {"challenge": str(parsed.get("challenge") or "").strip()}

        if parsed.get("kind") == "event":
            append_fn = globals().get("_append_channel_event")
            if callable(append_fn):
                team_id = str(parsed.get("team_id") or "").strip().lower()
                channel_id = str(parsed.get("channel") or "").strip() or "slack"
                vault = load_vault()
                items = vault.get("credentials", [])
                if not isinstance(items, list):
                    items = []
                matched_workspaces: List[str] = []
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    if str(item.get("provider") or "").strip().lower() != "slack":
                        continue
                    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
                    item_team_id = str(metadata.get("team_id") or "").strip().lower()
                    if team_id and item_team_id and item_team_id != team_id:
                        continue
                    workspace_id = _normalize_workspace_id(item.get("workspace_id"))
                    if workspace_id in matched_workspaces:
                        continue
                    matched_workspaces.append(workspace_id)
                    append_fn(
                        channel="slack",
                        direction="inbound",
                        event_type=str(parsed.get("event_type") or parsed.get("message_type") or "event"),
                        text=str(parsed.get("text") or parsed.get("reaction") or "").strip() or None,
                        workspace_id=workspace_id,
                        session_key=channel_id,
                        message_id=str(parsed.get("message_ts") or parsed.get("ts") or parsed.get("event_id") or "").strip() or None,
                        trace_id=f"slack:{str(parsed.get('event_id') or parsed.get('ts') or uuid.uuid4()).strip()}",
                        metadata=parsed,
                    )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _discord_candidate_public_keys(rows: List[Dict[str, Any]]) -> List[str]:
    candidates: List[str] = []
    env_public_key = str(os.getenv("DISCORD_APP_PUBLIC_KEY") or "").strip()
    if env_public_key:
        candidates.append(env_public_key)
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            secret = resolve_vault_credential(str(row.get("id") or "").strip(), _normalize_workspace_id(row.get("workspace_id")))
        except Exception:
            continue
        for key in (
            str(secret.get("public_key") or "").strip(),
            str(secret.get("application_public_key") or "").strip(),
        ):
            if key and key not in candidates:
                candidates.append(key)
    return candidates


async def discord_webhook(request: Request):
    raw_body = await request.body()
    headers = dict(request.headers.items())
    try:
        payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        if not isinstance(payload, dict):
            payload = {}
        vault = load_vault()
        items = vault.get("credentials", [])
        if not isinstance(items, list):
            items = []
        discord_rows = [
            item
            for item in items
            if isinstance(item, dict) and str(item.get("provider") or "").strip().lower() == "discord_bot"
        ]
        signature = str(headers.get("x-signature-ed25519") or headers.get("X-Signature-Ed25519") or "").strip()
        if signature:
            public_keys = _discord_candidate_public_keys(discord_rows)
            if not public_keys:
                raise HTTPException(status_code=400, detail="Discord interaction public key is not configured.")
            if not any(discord_verify_interaction_signature(headers, raw_body, key) for key in public_keys):
                raise HTTPException(status_code=401, detail="Discord request signature is invalid.")

        parsed = discord_parse_inbound_event(payload, event_type=str(headers.get("x-discord-event") or "").strip())
        if parsed.get("kind") == "ping":
            return {"type": 1}

        append_fn = globals().get("_append_channel_event")
        from server_modules.agent_turn import execute_system_agent_turn
        from server_modules.runtime_models import RunStartRequest
        from server_modules.runtime_runs_api import _run_execution_services
        from server_modules.turn_runtime import execute_system_run_start_request_via_turn_runtime
        from server_modules.runs_execution import create_run as create_run_fn

        handled = 0
        triggered = 0
        triggered_run_id = ""
        for row in discord_rows:
            row_id = str(row.get("id") or "").strip()
            if not row_id:
                continue
            workspace_id = _normalize_workspace_id(row.get("workspace_id"))
            try:
                secret = resolve_vault_credential(row_id, workspace_id)
            except Exception:
                continue
            metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
            if not discord_event_matches_connector(parsed, secret, metadata):
                continue
            outcome = discord_dispatch_inbound_event(
                parsed,
                connector_entry=row,
                credentials=secret,
                append_event_fn=append_fn if callable(append_fn) else None,
                execute_agent_turn_request=lambda **kwargs: execute_system_agent_turn(
                    run_execution_services=_run_execution_services(),
                    **kwargs,
                ),
                run_start_request_class=RunStartRequest,
                start_run_request=lambda request: execute_system_run_start_request_via_turn_runtime(
                    request,
                    stamp_request_owner_fn=lambda req, current_user: req,
                    services=_run_execution_services(),
                ),
                create_run_fn=lambda *, context: create_run_fn(engine="orion", context=context),
            )
            handled += 1
            if outcome.get("triggered"):
                triggered += 1
                if not triggered_run_id:
                    triggered_run_id = str(outcome.get("run_id") or "").strip()

        if parsed.get("kind") == "interaction":
            if triggered_run_id:
                return {
                    "type": 4,
                    "data": {
                        "content": f"Started run {triggered_run_id}.",
                        "flags": 64,
                    },
                }
            return {
                "type": 4,
                "data": {
                    "content": "Received.",
                    "flags": 64,
                },
            }
        return {"ok": True, "handled": handled, "triggered": triggered}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


async def github_events_webhook(request: Request):
    raw_body = await request.body()
    headers = dict(request.headers.items())
    try:
        payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        if not isinstance(payload, dict):
            payload = {}
        vault = load_vault()
        items = vault.get("credentials", [])
        if not isinstance(items, list):
            items = []
        github_rows = [
            item
            for item in items
            if isinstance(item, dict) and str(item.get("provider") or "").strip().lower() == "github"
        ]
        secrets: List[str] = []
        for item in github_rows:
            item_id = str(item.get("id") or "").strip()
            if not item_id:
                continue
            try:
                secret = resolve_vault_credential(item_id, _normalize_workspace_id(item.get("workspace_id")))
            except Exception:
                continue
            webhook_secret = str(secret.get("webhook_secret") or "").strip()
            if webhook_secret:
                secrets.append(webhook_secret)
        if secrets and not any(github_verify_request_signature(headers, raw_body, secret) for secret in secrets):
            raise HTTPException(status_code=401, detail="GitHub webhook signature is invalid.")

        parsed = github_parse_inbound_event(
            payload,
            event_type=str(headers.get("x-github-event") or headers.get("X-GitHub-Event") or "").strip(),
            delivery_id=str(headers.get("x-github-delivery") or headers.get("X-GitHub-Delivery") or "").strip(),
        )
        append_fn = globals().get("_append_channel_event")
        if callable(append_fn):
            matched_workspaces: List[str] = []
            owner = str(parsed.get("owner") or "").strip().lower()
            repository = str(parsed.get("repository") or "").strip() or "github"
            for item in github_rows:
                metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
                item_username = str(metadata.get("username") or "").strip().lower()
                if owner and item_username and item_username != owner:
                    continue
                workspace_id = _normalize_workspace_id(item.get("workspace_id"))
                if workspace_id in matched_workspaces:
                    continue
                matched_workspaces.append(workspace_id)
                append_fn(
                    channel="github",
                    direction="inbound",
                    event_type=str(parsed.get("event_type") or "event"),
                    text=(
                        str(parsed.get("head_commit") or parsed.get("title") or parsed.get("action") or "").strip()
                        or None
                    ),
                    workspace_id=workspace_id,
                    session_key=repository,
                    message_id=str(parsed.get("delivery_id") or parsed.get("after") or "").strip() or None,
                    trace_id=f"github:{str(parsed.get('delivery_id') or parsed.get('after') or uuid.uuid4()).strip()}",
                    metadata=parsed,
                )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

async def create_connector_vault(body: ConnectorCreate):
    body.validate_fields()
    connector = body.connector.lower().strip()
    credentials = body.credentials

    try:
        if connector == "google_workspace":
            test = validate_google_workspace_connector(credentials)
        elif connector == "microsoft_365":
            test = validate_microsoft_365_connector(credentials)
        elif connector == "smtp":
            test = validate_smtp_connector(credentials)
        elif connector == "telegram_bot":
            test = validate_telegram_connector(credentials)
        elif connector == "wechat_work":
            test = validate_wechat_work_connector(credentials)
        elif connector == "whatsapp_twilio":
            test = validate_whatsapp_twilio_connector(credentials)
        elif connector == "discord_bot":
            test = validate_discord_bot_connector(credentials)
        elif connector == "slack":
            test = validate_slack_connector(credentials)
            credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else credentials
        elif connector == "github":
            test = validate_github_connector(credentials)
            credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else credentials
        elif connector == "dropbox":
            test = validate_dropbox_connector(credentials)
            credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else credentials
        elif connector == "s3":
            test = validate_s3_connector(credentials)
            credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else credentials
        elif connector == "notion":
            test = validate_notion_connector(credentials)
            credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else credentials
        elif connector == "linear":
            test = validate_linear_connector(credentials)
            credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else credentials
        elif connector == "instagram_business":
            test = validate_instagram_business_connector(credentials)
        elif connector == "irc":
            test = validate_irc_connector(credentials)
        else:
            raise RuntimeError(f"Unsupported connector '{connector}'")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    now = datetime.utcnow().isoformat() + "Z"
    connector_metadata = {
        **_connector_public_metadata(connector, credentials),
        **(body.metadata or {}),
    }
    connector_metadata["capability_verification"] = capability_verification_metadata(connector, test)
    if connector == "google_workspace" and isinstance(test, dict):
        profile = test.get("profile") if isinstance(test.get("profile"), dict) else {}
        email_address = str(profile.get("emailAddress") or "").strip() if isinstance(profile, dict) else ""
        auth_mode = str(credentials.get("auth_mode") or credentials.get("authMode") or "").strip().lower()
        drive = test.get("drive") if isinstance(test.get("drive"), dict) else {}
        drive_type = str(drive.get("driveType") or "").strip() if isinstance(drive, dict) else ""
        if email_address:
            connector_metadata["emailAddress"] = email_address
        if auth_mode:
            connector_metadata["auth_mode"] = auth_mode
        if drive_type:
            connector_metadata["drive_type"] = drive_type
    if connector == "microsoft_365" and isinstance(test, dict):
        profile = test.get("profile") if isinstance(test.get("profile"), dict) else {}
        display_name = str(profile.get("displayName") or "").strip() if isinstance(profile, dict) else ""
        mail = str(profile.get("mail") or "").strip() if isinstance(profile, dict) else ""
        user_principal_name = str(profile.get("userPrincipalName") or "").strip() if isinstance(profile, dict) else ""
        account_id = str(profile.get("id") or "").strip() if isinstance(profile, dict) else ""
        drive = test.get("drive") if isinstance(test.get("drive"), dict) else {}
        drive_id = str(drive.get("id") or "").strip() if isinstance(drive, dict) else ""
        drive_type = str(drive.get("driveType") or "").strip() if isinstance(drive, dict) else ""
        if display_name:
            connector_metadata["displayName"] = display_name
        if mail:
            connector_metadata["mail"] = mail
            connector_metadata["email"] = mail
        if user_principal_name:
            connector_metadata["userPrincipalName"] = user_principal_name
        if drive_id:
            connector_metadata["drive_id"] = drive_id
        if drive_type:
            connector_metadata["drive_type"] = drive_type
        if account_id:
            credentials = {**credentials, "account_id": account_id}
        if user_principal_name and not credentials.get("userPrincipalName"):
            credentials = {**credentials, "userPrincipalName": user_principal_name}
        if drive_id and not credentials.get("drive_id"):
            credentials = {**credentials, "drive_id": drive_id}
    if connector == "slack" and isinstance(test, dict):
        team = test.get("team") if isinstance(test.get("team"), dict) else {}
        bot = test.get("bot") if isinstance(test.get("bot"), dict) else {}
        authed_user = test.get("authed_user") if isinstance(test.get("authed_user"), dict) else {}
        team_id = str(team.get("id") or "").strip()
        team_name = str(team.get("name") or "").strip()
        bot_user_id = str(bot.get("user_id") or "").strip()
        bot_status = str(bot.get("bot_status") or "").strip()
        authed_user_id = str(authed_user.get("id") or "").strip()
        if team_id:
            connector_metadata["team_id"] = team_id
        if team_name:
            connector_metadata["team_name"] = team_name
        if bot_user_id:
            connector_metadata["bot_user_id"] = bot_user_id
        if bot_status:
            connector_metadata["bot_status"] = bot_status
        if authed_user_id:
            connector_metadata["authed_user_id"] = authed_user_id
        merged_credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else {}
        if merged_credentials:
            credentials = {**credentials, **merged_credentials}
    if connector == "discord_bot" and isinstance(test, dict):
        bot = test.get("bot") if isinstance(test.get("bot"), dict) else {}
        guild = test.get("guild") if isinstance(test.get("guild"), dict) else {}
        channel = test.get("channel") if isinstance(test.get("channel"), dict) else {}
        application = test.get("application") if isinstance(test.get("application"), dict) else {}
        bot_id = str(bot.get("id") or "").strip()
        bot_username = str(bot.get("username") or "").strip()
        bot_status = str(bot.get("bot_status") or "active").strip()
        guild_id = str(guild.get("id") or test.get("guild_id") or credentials.get("guild_id") or "").strip()
        guild_name = str(guild.get("name") or "").strip()
        channel_id = str(channel.get("id") or test.get("channel_id") or credentials.get("channel_id") or "").strip()
        channel_name = str(channel.get("name") or "").strip()
        application_id = str(application.get("id") or credentials.get("application_id") or "").strip()
        if bot_id:
            connector_metadata["bot_id"] = bot_id
        if bot_username:
            connector_metadata["bot_username"] = bot_username
        if bot_status:
            connector_metadata["bot_status"] = bot_status
        if guild_id:
            connector_metadata["guild_id"] = guild_id
        if guild_name:
            connector_metadata["guild_name"] = guild_name
        if channel_id:
            connector_metadata["channel_id"] = channel_id
        if channel_name:
            connector_metadata["channel_name"] = channel_name
        if application_id:
            connector_metadata["application_id"] = application_id
        merged_credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else {}
        if merged_credentials:
            credentials = {**credentials, **merged_credentials}
    if connector == "github" and isinstance(test, dict):
        profile = test.get("profile") if isinstance(test.get("profile"), dict) else {}
        username = str(test.get("username") or profile.get("login") or "").strip()
        auth_mode = str(test.get("auth_mode") or credentials.get("auth_mode") or "").strip().lower()
        profile_type = str(profile.get("type") or "").strip()
        if username:
            connector_metadata["username"] = username
        if auth_mode:
            connector_metadata["auth_mode"] = auth_mode
        if profile_type:
            connector_metadata["profile_type"] = profile_type
        merged_credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else {}
        if merged_credentials:
            credentials = {**credentials, **merged_credentials}
    if connector == "dropbox" and isinstance(test, dict):
        display_name = str(test.get("display_name") or "").strip()
        email = str(test.get("email") or "").strip()
        account_id = str(test.get("account_id") or "").strip()
        auth_mode = str(test.get("auth_mode") or credentials.get("auth_mode") or "").strip().lower()
        if display_name:
            connector_metadata["display_name"] = display_name
        if email:
            connector_metadata["email"] = email
        if account_id:
            connector_metadata["account_id"] = account_id
        if auth_mode:
            connector_metadata["auth_mode"] = auth_mode
        merged_credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else {}
        if merged_credentials:
            credentials = {**credentials, **merged_credentials}
    if connector == "s3" and isinstance(test, dict):
        region = str(test.get("region") or "").strip()
        access_key_hint = str(test.get("access_key_hint") or "").strip()
        bucket_count = test.get("bucket_count")
        auth_mode = str(test.get("auth_mode") or credentials.get("auth_mode") or "").strip().lower()
        if region:
            connector_metadata["region"] = region
        if access_key_hint:
            connector_metadata["access_key_hint"] = access_key_hint
        if bucket_count not in {None, ""}:
            connector_metadata["bucket_count"] = bucket_count
        if auth_mode:
            connector_metadata["auth_mode"] = auth_mode
        merged_credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else {}
        if merged_credentials:
            credentials = {**credentials, **merged_credentials}
    if connector == "notion" and isinstance(test, dict):
        workspace_name = str(test.get("workspace_name") or "").strip()
        workspace_id = str(test.get("workspace_id") or "").strip()
        auth_mode = str(test.get("auth_mode") or credentials.get("auth_mode") or "").strip().lower()
        if workspace_name:
            connector_metadata["workspace_name"] = workspace_name
        if workspace_id:
            connector_metadata["workspace_id"] = workspace_id
        if auth_mode:
            connector_metadata["auth_mode"] = auth_mode
        merged_credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else {}
        if merged_credentials:
            credentials = {**credentials, **merged_credentials}
    if connector == "linear" and isinstance(test, dict):
        organization_name = str(test.get("organization_name") or "").strip()
        organization_id = str(test.get("organization_id") or "").strip()
        username = str(test.get("username") or "").strip()
        auth_mode = str(test.get("auth_mode") or credentials.get("auth_mode") or "").strip().lower()
        if organization_name:
            connector_metadata["organization_name"] = organization_name
        if organization_id:
            connector_metadata["organization_id"] = organization_id
        if username:
            connector_metadata["username"] = username
        if auth_mode:
            connector_metadata["auth_mode"] = auth_mode
        merged_credentials = test.get("credentials") if isinstance(test.get("credentials"), dict) else {}
        if merged_credentials:
            credentials = {**credentials, **merged_credentials}
    if connector == "smtp" and isinstance(test, dict):
        profile = test.get("profile") if isinstance(test.get("profile"), dict) else {}
        host = str(profile.get("host") or credentials.get("host") or "").strip()
        username = str(profile.get("username") or credentials.get("username") or "").strip()
        port = str(profile.get("port") or credentials.get("port") or "").strip()
        if host:
            connector_metadata["host"] = host
        if username:
            connector_metadata["username"] = username
        if port:
            connector_metadata["port"] = port
        connector_metadata["use_tls"] = bool(credentials.get("use_tls"))

    duplicate = _find_duplicate_connector_entry(connector, credentials, body.workspace_id)
    if isinstance(duplicate, dict):
        raise HTTPException(
            status_code=409,
            detail=(
                "Duplicate connector identity already exists: "
                f"{str(duplicate.get('label') or duplicate.get('id') or 'existing connector')}"
            ),
        )

    entry = {
        "id": str(uuid.uuid4()),
        "label": body.label.strip(),
        "provider": connector,
        "workspace_id": _normalize_workspace_id(body.workspace_id),
        "mode": "connector",
        "metadata": _sanitize_connector_metadata(connector_metadata),
        "created_at": now,
        "updated_at": now,
        "encrypted_secret": _openssl_encrypt(json.dumps(credentials, separators=(",", ":"))),
    }

    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []
    existing.append(entry)
    vault["credentials"] = existing
    save_vault(vault)

    return {
        "id": entry["id"],
        "label": entry["label"],
        "connector": connector,
        "workspace_id": entry.get("workspace_id"),
        "metadata": entry["metadata"],
        "created_at": entry["created_at"],
        "updated_at": entry["updated_at"],
        "test": test,
    }

async def update_connector_vault(credential_id: str, body: ConnectorPatchRequest):
    body.validate_fields()
    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []

    found = False
    updated_entry: Dict[str, Any] | None = None
    next_items: List[Dict[str, Any]] = []
    requested_workspace = _normalize_workspace_id(body.workspace_id)
    for item in existing:
        if not isinstance(item, dict):
            next_items.append(item)
            continue
        if str(item.get("id") or "").strip() != credential_id:
            next_items.append(item)
            continue
        found = True
        if str(item.get("mode") or "").strip().lower() != "connector":
            raise HTTPException(status_code=400, detail="Credential is not a connector.")
        if not _workspace_visible(item.get("workspace_id"), requested_workspace):
            raise HTTPException(status_code=403, detail="Connector is not accessible for this workspace.")
        next_item = dict(item)
        if body.label is not None:
            next_item["label"] = body.label.strip()
        if body.metadata is not None:
            merged_metadata = dict(next_item.get("metadata") if isinstance(next_item.get("metadata"), dict) else {})
            for key, value in body.metadata.items():
                if value is None:
                    merged_metadata.pop(str(key), None)
                else:
                    merged_metadata[str(key)] = value
            next_item["metadata"] = _sanitize_connector_metadata(merged_metadata)
        next_item["updated_at"] = datetime.utcnow().isoformat() + "Z"
        updated_entry = next_item
        next_items.append(next_item)
    if not found or not isinstance(updated_entry, dict):
        raise HTTPException(status_code=404, detail="Connector not found.")

    vault["credentials"] = next_items
    save_vault(vault)
    return {
        "id": updated_entry["id"],
        "label": updated_entry["label"],
        "connector": str(updated_entry.get("provider") or "").strip().lower(),
        "workspace_id": updated_entry.get("workspace_id"),
        "metadata": updated_entry.get("metadata") if isinstance(updated_entry.get("metadata"), dict) else {},
        "created_at": updated_entry.get("created_at"),
        "updated_at": updated_entry.get("updated_at"),
    }

async def test_connector_vault(credential_id: str, workspace_id: Optional[str] = None):
    def _persist_capability_verification(test_result: Any) -> None:
        vault = load_vault()
        items = vault.get("credentials", [])
        if not isinstance(items, list):
            return
        updated = False
        next_items: List[Dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                next_items.append(item)
                continue
            if str(item.get("id") or "").strip() != str(credential_id or "").strip():
                next_items.append(item)
                continue
            next_item = dict(item)
            metadata = dict(next_item.get("metadata") if isinstance(next_item.get("metadata"), dict) else {})
            metadata["capability_verification"] = capability_verification_metadata(connector, test_result)
            next_item["metadata"] = _sanitize_connector_metadata(metadata)
            next_item["updated_at"] = datetime.utcnow().isoformat() + "Z"
            next_items.append(next_item)
            updated = True
        if updated:
            vault["credentials"] = next_items
            save_vault(vault)

    try:
        credentials = resolve_vault_credential(credential_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    connector = str(credentials.get("_provider") or "").lower().strip()
    test_result: Dict[str, Any]
    if connector == "google_workspace":
        try:
            test_result = validate_google_workspace_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "smtp":
        try:
            test_result = validate_smtp_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "microsoft_365":
        try:
            test_result = validate_microsoft_365_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "telegram_bot":
        try:
            test_result = validate_telegram_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "wechat_work":
        try:
            test_result = validate_wechat_work_connector(credentials, send_test=True)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "whatsapp_twilio":
        try:
            test_result = validate_whatsapp_twilio_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "discord_bot":
        try:
            test_result = validate_discord_bot_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "slack":
        try:
            test_result = validate_slack_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "github":
        try:
            test_result = validate_github_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "dropbox":
        try:
            test_result = validate_dropbox_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "s3":
        try:
            test_result = validate_s3_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "notion":
        try:
            test_result = validate_notion_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "linear":
        try:
            test_result = validate_linear_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "instagram_business":
        try:
            test_result = validate_instagram_business_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    elif connector == "irc":
        try:
            test_result = validate_irc_connector(credentials)
        except Exception as exc:
            _persist_capability_verification({"ok": False, "status": 400, "message": str(exc)})
            raise HTTPException(status_code=400, detail=str(exc))
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported connector '{connector}'")

    _persist_capability_verification(test_result)
    return test_result

async def delete_connector_vault(credential_id: str, workspace_id: Optional[str] = None):
    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []
    found = False
    next_items = []
    for item in existing:
        if not isinstance(item, dict):
            next_items.append(item)
            continue
        if str(item.get("id") or "").strip() != credential_id:
            next_items.append(item)
            continue
        found = True
        if str(item.get("mode") or "").strip().lower() != "connector":
            raise HTTPException(status_code=400, detail="Credential is not a connector.")
        if not _workspace_visible(item.get("workspace_id"), workspace_id):
            raise HTTPException(status_code=403, detail="Connector is not accessible for this workspace.")
    if not found:
        raise HTTPException(status_code=404, detail="Connector not found.")
    vault["credentials"] = next_items
    save_vault(vault)
    return {"status": "ok"}

async def create_vault_credential(body: CredentialUpsertRequest):
    body.validate_fields()
    provider = normalize_provider_id(body.provider)
    credentials = dict(body.credentials or {})
    auth_mode = normalize_auth_mode(provider, credentials=credentials)
    if auth_mode and not provider_supports_auth_mode(provider, auth_mode):
        raise HTTPException(status_code=400, detail=f"Unsupported auth mode '{auth_mode}' for provider '{provider}'.")
    if auth_mode:
        credentials["auth_mode"] = auth_mode
    models: List[str] = []
    if not bool(getattr(body, "skip_validation", False)):
        _, _, adapter = resolve_provider_adapter(provider, credentials)
        try:
            check = adapter.validate(credentials)
            if not check.get("ok"):
                raise RuntimeError(check.get("message", "Credential validation failed."))
            models = adapter.list_models(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    now = datetime.utcnow().isoformat() + "Z"
    entry_metadata = {
        **_provider_public_metadata(provider, credentials),
        **(body.metadata or {}),
    }
    entry = {
        "id": str(uuid.uuid4()),
        "label": body.label.strip(),
        "provider": provider,
        "workspace_id": _normalize_workspace_id(body.workspace_id),
        "mode": body.mode,
        "metadata": entry_metadata,
        "created_at": now,
        "updated_at": now,
        "encrypted_secret": _openssl_encrypt(json.dumps(credentials, separators=(",", ":"))),
    }

    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []
    existing.append(entry)
    vault["credentials"] = existing
    save_vault(vault)

    return {
        "id": entry["id"],
        "label": entry["label"],
        "provider": entry["provider"],
        "workspace_id": entry.get("workspace_id"),
        "mode": entry["mode"],
        "metadata": entry["metadata"],
        "created_at": entry["created_at"],
        "updated_at": entry["updated_at"],
        "models_preview": models[:25],
    }

async def delete_vault_credential(credential_id: str, workspace_id: Optional[str] = None):
    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []
    found = False
    next_items = []
    for item in existing:
        if item.get("id") != credential_id:
            next_items.append(item)
            continue
        found = True
        if not _workspace_visible(item.get("workspace_id"), workspace_id):
            raise HTTPException(status_code=403, detail="Credential is not accessible for this workspace.")
    if not found:
        raise HTTPException(status_code=404, detail="Credential not found.")
    vault["credentials"] = next_items
    save_vault(vault)
    return {"status": "ok"}

async def test_vault_credential(credential_id: str, workspace_id: Optional[str] = None):
    try:
        credentials = resolve_vault_credential(credential_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    try:
        provider, _, adapter = resolve_provider_adapter(credentials.get("_provider"), credentials)
        result = adapter.validate(credentials)
        models = adapter.list_models(credentials) if result.get("ok") else []
        return {
            "ok": bool(result.get("ok")),
            "status": result.get("status"),
            "message": result.get("message", "Validation complete."),
            "provider": provider,
            "models_preview": models[:25],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
