from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
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

async def create_connector_vault(body: ConnectorCreate):
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
