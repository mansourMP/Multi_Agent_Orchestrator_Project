from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})

def _serialize_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    now = _utc_now()
    cooldown_until = _parse_utc_ts(profile.get("cooldown_until"))
    return {
        "id": profile.get("id"),
        "provider": normalize_provider_id(profile.get("provider")),
        "label": profile.get("label"),
        "credential_id": profile.get("credential_id"),
        "auth_mode": normalize_auth_mode(profile.get("provider"), profile.get("auth_mode")),
        "workspace_id": profile.get("workspace_id"),
        "priority": profile.get("priority", 100),
        "enabled": bool(profile.get("enabled", True)),
        "model": profile.get("model"),
        "health": "cooldown" if cooldown_until and cooldown_until > now else ("healthy" if bool(profile.get("enabled", True)) else "disabled"),
        "cooldown_until": profile.get("cooldown_until"),
        "last_error": profile.get("last_error"),
        "last_used_at": profile.get("last_used_at"),
        "last_success_at": profile.get("last_success_at"),
        "last_failure_at": profile.get("last_failure_at"),
        "success_count": int(profile.get("success_count", 0)),
        "failure_count": int(profile.get("failure_count", 0)),
        "created_at": profile.get("created_at"),
        "updated_at": profile.get("updated_at"),
    }

async def list_provider_profiles(workspace_id: Optional[str] = None, provider: Optional[str] = None):
    requested_ws = _normalize_workspace_id(workspace_id) or None
    requested_provider = normalize_provider_id(provider) if provider else None
    with PROFILES_LOCK:
        items = [dict(item) for item in PROVIDER_PROFILES.values() if isinstance(item, dict)]
    out: List[Dict[str, Any]] = []
    for item in items:
        if requested_ws and str(item.get("workspace_id") or "default").strip() != requested_ws:
            continue
        if requested_provider and normalize_provider_id(item.get("provider")) != requested_provider:
            continue
        out.append(_serialize_profile(item))
    out.sort(key=lambda p: (str(p.get("provider") or ""), int(p.get("priority") or 100), str(p.get("label") or "")))
    return {"items": out}

async def upsert_provider_profile(body: ProviderProfileUpsertRequest):
    body.validate_fields()
    workspace_id = _normalize_workspace_id(body.workspace_id) or "default"
    provider_id = normalize_provider_id(body.provider)
    auth_mode = normalize_auth_mode(provider_id, body.auth_mode)
    if auth_mode and not provider_supports_auth_mode(provider_id, auth_mode):
        raise HTTPException(status_code=400, detail=f"Unsupported auth mode '{body.auth_mode}' for provider '{provider_id}'.")
    credential_id = str(body.credential_id or "").strip()
    if provider_requires_credential(provider_id, auth_mode):
        if len(credential_id) < 6:
            raise HTTPException(status_code=400, detail="credential_id is required.")
        _ = resolve_vault_credential(credential_id, workspace_id)
    else:
        credential_id = ""
    now = _utc_now_iso()
    profile_id = str(body.id or "").strip() or str(uuid.uuid4())
    with PROFILES_LOCK:
        existing = PROVIDER_PROFILES.get(profile_id, {})
        if existing and not isinstance(existing, dict):
            existing = {}
        profile = {
            "id": profile_id,
            "provider": provider_id,
            "label": str(body.label).strip(),
            "credential_id": credential_id,
            "auth_mode": auth_mode or None,
            "workspace_id": workspace_id,
            "priority": int(body.priority),
            "enabled": bool(body.enabled),
            "model": str(body.model).strip() if body.model else None,
            "cooldown_until": existing.get("cooldown_until"),
            "last_error": existing.get("last_error"),
            "last_used_at": existing.get("last_used_at"),
            "last_success_at": existing.get("last_success_at"),
            "last_failure_at": existing.get("last_failure_at"),
            "success_count": int(existing.get("success_count", 0)),
            "failure_count": int(existing.get("failure_count", 0)),
            "created_at": existing.get("created_at") or now,
            "updated_at": now,
        }
        PROVIDER_PROFILES[profile_id] = profile
    _persist_provider_profiles()
    return {"item": _serialize_profile(profile)}

async def enable_provider_profile(profile_id: str):
    with PROFILES_LOCK:
        profile = PROVIDER_PROFILES.get(profile_id)
        if not isinstance(profile, dict):
            raise HTTPException(status_code=404, detail="Profile not found.")
        profile["enabled"] = True
        profile["updated_at"] = _utc_now_iso()
        PROVIDER_PROFILES[profile_id] = profile
    _persist_provider_profiles()
    return {"item": _serialize_profile(profile)}

async def disable_provider_profile(profile_id: str):
    with PROFILES_LOCK:
        profile = PROVIDER_PROFILES.get(profile_id)
        if not isinstance(profile, dict):
            raise HTTPException(status_code=404, detail="Profile not found.")
        profile["enabled"] = False
        profile["updated_at"] = _utc_now_iso()
        PROVIDER_PROFILES[profile_id] = profile
    _persist_provider_profiles()
    return {"item": _serialize_profile(profile)}

async def delete_provider_profile(profile_id: str):
    with PROFILES_LOCK:
        profile = PROVIDER_PROFILES.get(profile_id)
        if not isinstance(profile, dict):
            raise HTTPException(status_code=404, detail="Profile not found.")
        del PROVIDER_PROFILES[profile_id]
    _persist_provider_profiles()
    return {"status": "ok"}

async def provider_profiles_health(workspace_id: Optional[str] = None):
    requested_ws = _normalize_workspace_id(workspace_id) or None
    with PROFILES_LOCK:
        profiles = [dict(item) for item in PROVIDER_PROFILES.values() if isinstance(item, dict)]
    summary = {"healthy": 0, "cooldown": 0, "disabled": 0, "total": 0}
    items: List[Dict[str, Any]] = []
    for profile in profiles:
        if requested_ws and str(profile.get("workspace_id") or "default").strip() != requested_ws:
            continue
        item = _serialize_profile(profile)
        health = str(item.get("health") or "disabled")
        if health not in summary:
            health = "disabled"
        summary[health] += 1
        summary["total"] += 1
        items.append(item)
    return {"summary": summary, "items": items}

async def get_tool_contracts():
    items: List[Dict[str, Any]] = []
    for tool_id, contract in TOOL_CONTRACTS.items():
        if not isinstance(contract, dict):
            continue
        items.append(
            {
                "tool_id": tool_id,
                "description": contract.get("description"),
                "optional": bool(contract.get("optional", True)),
                "allowlist_roles": contract.get("allowlist_roles", []),
                "denylist_roles": contract.get("denylist_roles", []),
                "input_schema": contract.get("input_schema", {}),
            }
        )
    items.sort(key=lambda item: str(item.get("tool_id") or ""))
    return {"items": items}

async def evaluate_tools_policy(body: ToolPolicyEvaluateRequest):
    body.validate_fields()
    trust_mode = normalize_trust_mode(body.trust_mode)
    target = normalize_execution_target(body.target)
    metadata = body.metadata if isinstance(body.metadata, dict) else {}

    evaluations: List[Dict[str, Any]] = []
    for raw_tool in body.tool_ids:
        tool_id = normalize_action_id(raw_tool)
        if not tool_id:
            continue
        evaluations.append(
            evaluate_tool_policy_decision(
                tool_id=tool_id,
                trust_mode=trust_mode,
                target=target,
                metadata=metadata,
            )
        )

    return {
        "ok": True,
        "trust_mode": trust_mode,
        "target": target,
        "count": len(evaluations),
        "items": evaluations,
        "tool_policy": tool_policy_snapshot(metadata),
    }

async def list_providers():
    providers = []
    for provider_id, info in PROVIDER_CATALOG.items():
        if bool(info.get("hidden")):
            continue
        providers.append({
            "id": provider_id,
            "label": info.get("label", provider_id),
            "auth": info.get("auth", []),
            "auth_modes": info.get("auth_modes", []),
            "default_auth_mode": info.get("default_auth_mode"),
            "default_model": info.get("default_model"),
        })
    return {"providers": providers}

async def get_anthropic_local_cli_status():
    if not shutil.which("claude"):
        return {
            "ok": False,
            "available": False,
            "loggedIn": False,
            "message": "Claude CLI is not installed on this machine.",
        }
    try:
        result = subprocess.run(
            ["claude", "auth", "status", "--json"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except Exception as exc:
        return {
            "ok": False,
            "available": True,
            "loggedIn": False,
            "message": str(exc),
        }

    raw = str(result.stdout or result.stderr or "").strip()
    if result.returncode != 0:
        return {
            "ok": False,
            "available": True,
            "loggedIn": False,
            "message": raw or f"Claude auth status failed with exit code {result.returncode}.",
        }
    try:
        payload = json.loads(raw) if raw else {}
    except Exception:
        payload = {}
    logged_in = bool(payload.get("loggedIn"))
    return {
        "ok": True,
        "available": True,
        "loggedIn": logged_in,
        "authMethod": str(payload.get("authMethod") or "").strip(),
        "apiProvider": str(payload.get("apiProvider") or "").strip(),
        "message": "Claude subscription is signed in on this machine." if logged_in else "Claude subscription is not signed in yet.",
    }

async def start_anthropic_local_cli_login():
    if not shutil.which("claude"):
        raise HTTPException(status_code=400, detail="Claude CLI is not installed on this machine.")
    try:
        subprocess.Popen(
            ["claude", "auth", "login"],
            cwd=str(PROJECT_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
        return {
            "ok": True,
            "message": "Claude login has been started. Complete the sign-in flow, then return here and refresh status.",
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

async def test_provider_credentials(body: CredentialTestRequest):
    body.validate_fields()
    provider, _, adapter = resolve_provider_adapter(body.provider, body.credentials)
    try:
        result = adapter.validate(body.credentials)
        models = adapter.list_models(body.credentials) if result.get("ok") else []
        return {
            "ok": bool(result.get("ok")),
            "status": result.get("status"),
            "message": result.get("message", "Validation complete."),
            "provider": provider,
            "models_preview": models[:25],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

async def get_provider_models(
    provider: str,
    credential_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    profile_id: Optional[str] = None,
):
    provider_id = normalize_provider_id(provider)
    if provider_id not in PROVIDER_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{provider}'")
    credentials: Dict[str, Any] = {}
    if profile_id:
        with PROFILES_LOCK:
            profile = PROVIDER_PROFILES.get(profile_id)
        if not isinstance(profile, dict):
            raise HTTPException(status_code=404, detail="Profile not found.")
        if normalize_provider_id(profile.get("provider")) != provider_id:
            raise HTTPException(status_code=400, detail="Profile provider mismatch.")
        ws = _normalize_workspace_id(workspace_id) or str(profile.get("workspace_id") or "default").strip() or "default"
        profile_auth_mode = normalize_auth_mode(provider_id, profile.get("auth_mode"))
        profile_credential_id = str(profile.get("credential_id") or "").strip()
        if profile_credential_id:
            try:
                credentials = resolve_vault_credential(profile_credential_id, ws)
            except Exception as exc:
                raise HTTPException(status_code=404, detail=str(exc))
        elif not provider_requires_credential(provider_id, profile_auth_mode):
            credentials = secretless_provider_credentials(provider_id, profile_auth_mode)
    elif credential_id:
        try:
            credentials = resolve_vault_credential(credential_id, workspace_id)
        except Exception as exc:
            raise HTTPException(status_code=404, detail=str(exc))
    elif provider_id == "openai":
        try:
            credentials = resolve_default_vault_credential("openai", workspace_id)
        except Exception:
            key, _ = _openai_env_bearer_with_source()
            if key:
                credentials = {
                    "access_token": key,
                    "org_id": OPENAI_ORG_ID,
                    "project_id": OPENAI_PROJECT_ID,
                }

    if not credentials:
        raise HTTPException(status_code=400, detail="No credential available for this provider.")

    try:
        _, _, adapter = resolve_provider_adapter(provider_id, credentials)
        models = adapter.list_models(credentials)
        return {"provider": provider_id, "models": models}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

async def list_credentials_vault(workspace_id: Optional[str] = None):
    return {"items": list_vault_credentials(workspace_id)}

async def list_connectors():
    items = []
    for connector_id, info in CONNECTOR_CATALOG.items():
        items.append(
            {
                "id": connector_id,
                "label": info.get("label", connector_id),
                "auth": info.get("auth", []),
            }
        )
    return {"connectors": items}

async def list_connectors_vault(workspace_id: Optional[str] = None):
    return {"items": list_vault_connectors(workspace_id)}

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
    body: Optional[Dict[str, Any]] = None,
    workspace_id: Optional[str] = None,
):
    try:
        secret = resolve_vault_credential(connector_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if str(secret.get("_provider") or "").strip() != "google_workspace":
        raise HTTPException(status_code=400, detail="Connector is not Google Workspace.")

    payload = body if isinstance(body, dict) else {}
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
    body: Optional[Dict[str, Any]] = None,
    workspace_id: Optional[str] = None,
):
    try:
        secret = resolve_vault_credential(connector_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if str(secret.get("_provider") or "").strip() != "google_workspace":
        raise HTTPException(status_code=400, detail="Connector is not Google Workspace.")

    payload = body if isinstance(body, dict) else {}
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

async def create_connector_vault(body: ConnectorUpsertRequest):
    body.validate_fields()
    connector = body.connector.lower().strip()
    credentials = body.credentials

    try:
        if connector == "google_workspace":
            test = validate_google_workspace_connector(credentials)
        elif connector == "microsoft_365":
            test = validate_microsoft_365_connector(credentials)
        elif connector == "telegram_bot":
            test = validate_telegram_connector(credentials)
        elif connector == "wechat_work":
            test = validate_wechat_work_connector(credentials)
        elif connector == "whatsapp_twilio":
            test = validate_whatsapp_twilio_connector(credentials)
        elif connector == "discord_bot":
            test = validate_discord_bot_connector(credentials)
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
    try:
        credentials = resolve_vault_credential(credential_id, workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    connector = str(credentials.get("_provider") or "").lower().strip()
    if connector == "google_workspace":
        try:
            return validate_google_workspace_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "microsoft_365":
        try:
            return validate_microsoft_365_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "telegram_bot":
        try:
            return validate_telegram_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "wechat_work":
        try:
            return validate_wechat_work_connector(credentials, send_test=True)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "whatsapp_twilio":
        try:
            return validate_whatsapp_twilio_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "discord_bot":
        try:
            return validate_discord_bot_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "instagram_business":
        try:
            return validate_instagram_business_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if connector == "irc":
        try:
            return validate_irc_connector(credentials)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    raise HTTPException(status_code=400, detail=f"Unsupported connector '{connector}'")

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
        models = adapter.list_models(credentials)
        return {
            "ok": bool(result.get("ok")),
            "status": result.get("status"),
            "message": result.get("message", "Validation complete."),
            "provider": provider,
            "models_preview": models[:25],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

async def rotate_vault_key(body: VaultRotateKeyRequest):
    body.validate_fields()
    if VAULT_KEY_ENV and VAULT_KEY_ENV.strip():
        raise HTTPException(
            status_code=400,
            detail="Vault key rotation is disabled while CREDENTIAL_VAULT_KEY env var is active.",
        )

    old_passphrase = _vault_passphrase()
    new_passphrase = body.new_passphrase.strip()
    if old_passphrase == new_passphrase:
        return {"status": "ok", "rotated": 0, "message": "New key matches current key."}

    vault = load_vault()
    items = vault.get("credentials", [])
    if not isinstance(items, list):
        items = []

    rotated = 0
    now = datetime.utcnow().isoformat() + "Z"
    for entry in items:
        encrypted = entry.get("encrypted_secret")
        if not isinstance(encrypted, str) or not encrypted:
            continue
        plain = _openssl_decrypt_with_passphrase(encrypted, old_passphrase)
        entry["encrypted_secret"] = _openssl_encrypt_with_passphrase(plain, new_passphrase)
        entry["updated_at"] = now
        rotated += 1

    vault["credentials"] = items
    save_vault(vault)
    _set_vault_passphrase(new_passphrase)
    return {"status": "ok", "rotated": rotated}

async def export_vault_credentials(body: VaultExportRequest):
    body.validate_fields()
    workspace_id = _normalize_workspace_id(body.workspace_id)
    passphrase = body.passphrase.strip()

    vault = load_vault()
    items = vault.get("credentials", [])
    if not isinstance(items, list):
        items = []

    export_items = []
    for entry in items:
        if not _workspace_visible(entry.get("workspace_id"), workspace_id):
            continue
        encrypted = entry.get("encrypted_secret")
        if not isinstance(encrypted, str) or not encrypted:
            continue
        try:
            plain = _openssl_decrypt(encrypted)
            creds = json.loads(plain)
        except Exception:
            continue
        if not isinstance(creds, dict):
            continue
        export_items.append({
            "label": entry.get("label"),
            "provider": entry.get("provider"),
            "workspace_id": entry.get("workspace_id"),
            "mode": entry.get("mode", "byok"),
            "metadata": entry.get("metadata", {}),
            "credentials": creds,
        })

    export_doc = {
        "version": 1,
        "workspace_id": workspace_id,
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "credentials": export_items,
    }
    bundle = _openssl_encrypt_with_passphrase(
        json.dumps(export_doc, separators=(",", ":")),
        passphrase,
    )
    return {
        "status": "ok",
        "workspace_id": workspace_id,
        "count": len(export_items),
        "bundle": bundle,
    }

async def import_vault_credentials(body: VaultImportRequest):
    body.validate_fields()
    workspace_override = _normalize_workspace_id(body.workspace_id)
    passphrase = body.passphrase.strip()

    try:
        plain = _openssl_decrypt_with_passphrase(body.bundle.strip(), passphrase)
        parsed = json.loads(plain)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid import bundle: {exc}")

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Import bundle payload is invalid.")
    raw_items = parsed.get("credentials")
    if not isinstance(raw_items, list):
        raise HTTPException(status_code=400, detail="Import bundle is missing credentials list.")

    vault = load_vault()
    existing = vault.get("credentials", [])
    if not isinstance(existing, list):
        existing = []

    index_by_identity = {}
    for idx, item in enumerate(existing):
        provider = str(item.get("provider") or "").strip().lower()
        label = str(item.get("label") or "").strip()
        if not provider or not label:
            continue
        key = _credential_identity(provider, label, item.get("workspace_id"))
        index_by_identity[key] = idx

    imported = 0
    overwritten = 0
    skipped = 0
    now = datetime.utcnow().isoformat() + "Z"

    for raw in raw_items:
        if not isinstance(raw, dict):
            skipped += 1
            continue
        provider = str(raw.get("provider") or "").strip().lower()
        label = str(raw.get("label") or "").strip()
        mode = str(raw.get("mode") or "byok").strip().lower()
        metadata = raw.get("metadata")
        credentials = raw.get("credentials")
        item_workspace_id = workspace_override if workspace_override is not None else _normalize_workspace_id(raw.get("workspace_id"))

        if provider not in PROVIDER_CATALOG or len(label) < 2:
            skipped += 1
            continue
        if mode not in ["byok", "managed", "vertex"]:
            mode = "byok"
        if not isinstance(credentials, dict) or len(credentials) == 0:
            skipped += 1
            continue
        if not isinstance(metadata, dict):
            metadata = {}
        metadata = {
            **_provider_public_metadata(provider, credentials),
            **metadata,
        }

        encrypted_secret = _openssl_encrypt(json.dumps(credentials, separators=(",", ":")))
        identity = _credential_identity(provider, label, item_workspace_id)
        existing_idx = index_by_identity.get(identity)
        if existing_idx is not None:
            if not body.overwrite:
                skipped += 1
                continue
            previous = existing[existing_idx]
            existing[existing_idx] = {
                "id": previous.get("id") or str(uuid.uuid4()),
                "label": label,
                "provider": provider,
                "workspace_id": item_workspace_id,
                "mode": mode,
                "metadata": metadata,
                "created_at": previous.get("created_at") or now,
                "updated_at": now,
                "encrypted_secret": encrypted_secret,
            }
            overwritten += 1
            continue

        existing.append({
            "id": str(uuid.uuid4()),
            "label": label,
            "provider": provider,
            "workspace_id": item_workspace_id,
            "mode": mode,
            "metadata": metadata,
            "created_at": now,
            "updated_at": now,
            "encrypted_secret": encrypted_secret,
        })
        index_by_identity[identity] = len(existing) - 1
        imported += 1

    vault["credentials"] = existing
    save_vault(vault)
    return {
        "status": "ok",
        "imported": imported,
        "overwritten": overwritten,
        "skipped": skipped,
        "workspace_id": workspace_override,
    }
