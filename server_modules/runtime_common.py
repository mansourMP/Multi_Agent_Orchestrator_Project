import os
from urllib.parse import quote_plus

from fastapi import HTTPException

from server_modules import runtime_config as config
from server_modules import shared as shared

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})

EMPYRALIST_WORKFLOW_API_URL = (
    str(
        os.getenv("EMPYRALIST_WORKFLOW_API_URL")
        or os.getenv("ORION_API_URL")
        or "http://127.0.0.1:8001"
    ).strip().rstrip("/")
    or "http://127.0.0.1:8001"
)

def metrics_inc(key: str, amount: float = 1):
    with METRICS_LOCK:
        RUNTIME_METRICS[key] = RUNTIME_METRICS.get(key, 0) + amount


def metrics_add(key: str, amount: float):
    with METRICS_LOCK:
        RUNTIME_METRICS[key] = RUNTIME_METRICS.get(key, 0) + amount


def _safe_write_json(path: Path, payload: Dict[str, Any]):
    parent = path.parent if path.parent != Path("") else Path(".")
    parent.mkdir(parents=True, exist_ok=True)
    # Use per-write temp file names so concurrent writers cannot race on a shared tmp path.
    tmp_path = parent / f".{path.name}.{uuid.uuid4().hex}.tmp"
    tmp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp_path.replace(path)


def _safe_read_json(path: Path, fallback: Dict[str, Any]) -> Dict[str, Any]:
    if not path.exists():
        return fallback
    try:
        raw = path.read_text(encoding="utf-8")
        parsed = json.loads(raw) if raw else {}
        if isinstance(parsed, dict):
            return parsed
        return fallback
    except Exception:
        return fallback

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat().replace("+00:00", "Z")


def _parse_utc_ts(raw: Any) -> Optional[datetime]:
    if not isinstance(raw, str) or not raw.strip():
        return None
    value = raw.strip()
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value).astimezone(timezone.utc)
    except Exception:
        return None


def _is_control_plane_mutation(request: Request) -> bool:
    return request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}


def _extract_request_api_key(request: Request) -> str:
    direct = request.headers.get("x-api-key")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def _check_control_plane_origin(request: Request) -> Optional[JSONResponse]:
    if not _is_control_plane_mutation(request):
        return None
    if not CONTROL_PLANE_ORIGINS:
        return None
    origin = request.headers.get("origin")
    if not origin:
        return None
    if origin not in CONTROL_PLANE_ORIGINS:
        return JSONResponse(
            status_code=403,
            content={
                "detail": "Origin is not allowed.",
                "origin": origin,
                "allowed_origins": CONTROL_PLANE_ORIGINS,
            },
        )
    return None


def _is_control_plane_rate_limited_path(request_path: str) -> bool:
    path = str(request_path or "").strip()
    if not path:
        return False
    if path == "/turn" or path == "/api/turn":
        return False
    if path.startswith("/runtime/runtimes/") or path.startswith("/runtime/tasks/"):
        return False
    return True


def _control_plane_rate_limit(request: Request) -> Optional[JSONResponse]:
    if not _is_control_plane_mutation(request):
        return None
    request_path = str(request.url.path or "")
    if not _is_control_plane_rate_limited_path(request_path):
        # Runtime claims/heartbeats and canonical turn streaming are chatty by design.
        # Keep control-plane limits focused on configuration-style mutation APIs.
        return None
    now = time.time()
    client_host = request.client.host if request.client else "unknown"
    api_key = _extract_request_api_key(request)
    identity = f"{client_host}:{api_key or 'anon'}"
    with RATE_LIMIT_LOCK:
        bucket = RATE_LIMIT_BUCKETS.get(identity, [])
        cutoff = now - 60.0
        bucket = [ts for ts in bucket if ts >= cutoff]
        limit = max(1, CONTROL_PLANE_RATE_LIMIT_PER_MINUTE + CONTROL_PLANE_RATE_LIMIT_BURST)
        if len(bucket) >= limit:
            retry_after = max(1, int(round(bucket[0] + 60.0 - now)))
            return JSONResponse(
                status_code=429,
                content={"detail": "Control plane rate limit exceeded.", "retry_after_seconds": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)
        RATE_LIMIT_BUCKETS[identity] = bucket
    return None







async def control_plane_guard_middleware(request: Request, call_next):
    origin_failure = _check_control_plane_origin(request)
    if origin_failure is not None:
        return origin_failure

    rate_limit_failure = _control_plane_rate_limit(request)
    if rate_limit_failure is not None:
        return rate_limit_failure

    if not _is_control_plane_mutation(request):
        return await call_next(request)

    idempotency_key = request.headers.get("x-idempotency-key") or request.headers.get("X-Idempotency-Key")
    if not isinstance(idempotency_key, str) or not idempotency_key.strip():
        return await call_next(request)

    body = await request.body()
    body_hash = hashlib.sha256(body).hexdigest()
    lookup = _idempotency_get(request.method, request.url.path, idempotency_key.strip(), body_hash)
    if lookup.get("hit") and lookup.get("conflict"):
        return JSONResponse(status_code=409, content={"detail": "Idempotency key reused with different payload."})
    if lookup.get("hit") and isinstance(lookup.get("record"), dict):
        record = lookup["record"]
        headers = {"X-Idempotent-Replay": "1"}
        return JSONResponse(status_code=int(record.get("status_code", 200)), content=record.get("response"), headers=headers)

    response = await call_next(request)
    if response.status_code >= 500:
        return response

    if response.media_type and "application/json" not in response.media_type.lower():
        return response
    if response.headers.get("content-type") and "application/json" not in response.headers.get("content-type", "").lower():
        return response

    body_bytes = b""
    async for chunk in response.body_iterator:
        body_bytes += chunk
    replay_response = Response(
        content=body_bytes,
        status_code=response.status_code,
        headers=dict(response.headers),
        media_type=response.media_type,
    )
    try:
        parsed = json.loads(body_bytes.decode("utf-8")) if body_bytes else None
    except Exception:
        parsed = None
    if parsed is not None:
        _idempotency_store(request.method, request.url.path, idempotency_key.strip(), body_hash, response.status_code, parsed)
    return replay_response

def require_api_key(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    from server_modules.auth import get_current_user

    return get_current_user(
        request=request,
        authorization=authorization,
        x_api_key=x_api_key,
    )


def require_viewer_api_key(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    return require_api_key(
        request=request,
        authorization=authorization,
        x_api_key=x_api_key,
    )


def require_member_api_key(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    from server_modules.auth import require_member_access

    return require_member_access(
        request=request,
        authorization=authorization,
        x_api_key=x_api_key,
    )


def require_admin_api_key(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
):
    from server_modules.auth import require_admin_access

    return require_admin_access(
        request=request,
        authorization=authorization,
        x_api_key=x_api_key,
    )

def http_json_request(
    url: str,
    *,
    headers: Optional[Dict[str, str]] = None,
    payload: Optional[Any] = None,
    method: Optional[str] = None,
    timeout: int = 30,
) -> Dict[str, Any]:
    request_headers = dict(headers or {})
    body: Optional[bytes] = None
    verb = (method or ("POST" if payload is not None else "GET")).upper()
    if payload is not None:
        if isinstance(payload, (bytes, bytearray)):
            body = bytes(payload)
        elif request_headers.get("Content-Type") == "application/x-www-form-urlencoded":
            if isinstance(payload, str):
                body = payload.encode("utf-8")
            else:
                body = urlencode(payload, doseq=True).encode("utf-8")
        else:
            body = json.dumps(payload).encode("utf-8")
            request_headers.setdefault("Content-Type", "application/json")
    req = urlrequest.Request(url, data=body, headers=request_headers, method=verb)
    context = ssl.create_default_context(cafile=certifi.where())
    try:
        with urlrequest.urlopen(req, timeout=timeout, context=context) as resp:
            raw = resp.read().decode("utf-8")
            parsed: Any = None
            try:
                parsed = json.loads(raw) if raw else None
            except Exception:
                parsed = None
            return {
                "status": int(getattr(resp, "status", resp.getcode())),
                "text": raw,
                "json": parsed,
                "headers": dict(resp.headers.items()),
            }
    except urlerror.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
        parsed: Any = None
        try:
            parsed = json.loads(raw) if raw else None
        except Exception:
            parsed = None
        return {
            "status": int(getattr(exc, "code", 500)),
            "text": raw,
            "json": parsed,
            "headers": dict(getattr(exc, "headers", {}).items()) if getattr(exc, "headers", None) else {},
        }


def _workflow_api_headers() -> Dict[str, str]:
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    api_key = str(os.getenv("ORION_API_KEY") or "").strip()
    if api_key:
        headers["X-API-Key"] = api_key
    return headers


def fetch_workflow_snapshot(workflow_id: Any) -> Optional[Dict[str, Any]]:
    token = str(workflow_id or "").strip()
    if not token:
        return None
    response = http_json_request(
        f"{EMPYRALIST_WORKFLOW_API_URL}/workflows/{quote_plus(token)}",
        headers=_workflow_api_headers(),
        timeout=20,
    )
    status = int(response.get("status") or 500)
    payload = response.get("json") if isinstance(response.get("json"), dict) else {}
    if status >= 400:
        detail = str(payload.get("message") or payload.get("detail") or "").strip()
        raise HTTPException(
            status_code=status if status in {400, 401, 403, 404, 409} else 502,
            detail=detail or f"Unable to load workflow '{token}'.",
        )
    definition = payload.get("definition") if isinstance(payload.get("definition"), dict) else {}
    return {
        "id": str(payload.get("id") or token).strip() or token,
        "name": str(payload.get("name") or "").strip() or None,
        "status": str(payload.get("status") or "").strip() or None,
        "definition": definition,
    }

_normalize_workspace_id = _normalize_workspace_id_impl
_workspace_visible = _workspace_visible_impl
_parse_iso_datetime = _parse_iso_datetime_impl
_credential_identity = _credential_identity_impl
_sanitize_bearer_token = _sanitize_bearer_token_impl
_openai_bearer_from_credentials = _openai_bearer_from_credentials_impl

list_vault_credentials = lambda workspace_id=None: _list_vault_credentials_impl(load_vault, CONNECTOR_CATALOG, workspace_id)
list_vault_connectors = lambda workspace_id=None: _list_vault_connectors_impl(load_vault, CONNECTOR_CATALOG, workspace_id)
resolve_vault_credential = lambda credential_id, workspace_id=None: _resolve_vault_credential_impl(load_vault, _openssl_decrypt, credential_id, workspace_id)
resolve_default_vault_credential = lambda provider, workspace_id=None: _resolve_default_vault_credential_impl(load_vault, _openssl_decrypt, provider, workspace_id)
_codex_token_from_vault = lambda: _codex_token_from_vault_impl(CODEX_AUTH_FILE, _safe_read_json)

validate_google_workspace_connector = lambda credentials: _validate_google_workspace_connector(credentials, http_json_request)
validate_microsoft_365_connector = lambda credentials: _validate_microsoft_365_connector(credentials, http_json_request)
validate_smtp_connector = lambda credentials: _validate_smtp_connector(credentials, http_json_request)
validate_telegram_connector = lambda credentials: _validate_telegram_connector(credentials, http_json_request)
validate_wechat_work_connector = lambda credentials, send_test=False: _validate_wechat_work_connector(credentials, http_json_request, send_test=send_test)
validate_whatsapp_twilio_connector = lambda credentials: _validate_whatsapp_twilio_connector(credentials, http_json_request)
validate_discord_bot_connector = lambda credentials: _validate_discord_bot_connector(credentials, http_json_request)
validate_slack_connector = lambda credentials: _validate_slack_connector(credentials, http_json_request)
validate_github_connector = lambda credentials: _validate_github_connector(credentials, http_json_request)
validate_dropbox_connector = lambda credentials: _validate_dropbox_connector(credentials, http_json_request)
validate_s3_connector = lambda credentials: _validate_s3_connector(credentials, http_json_request)
validate_notion_connector = lambda credentials: _validate_notion_connector(credentials, http_json_request)
validate_linear_connector = lambda credentials: _validate_linear_connector(credentials, http_json_request)
validate_instagram_business_connector = lambda credentials: _validate_instagram_business_connector(credentials, http_json_request)
validate_irc_connector = lambda credentials: _validate_irc_connector(credentials)


def list_recent_connector_messages(
    credentials: Dict[str, Any],
    *,
    limit: int = 3,
) -> List[Dict[str, Any]]:
    provider = str(credentials.get("_provider") or "").strip().lower()
    safe_limit = max(1, min(int(limit or 3), 10))
    if provider == "google_workspace":
        if google_workspace_uses_local_cli(credentials):
            return google_workspace_local_list_recent_messages(credentials, limit=safe_limit)

        listing = http_json_request(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            headers={"Authorization": f"Bearer {str(credentials.get('access_token') or '').strip()}"},
            payload=None,
            timeout=20,
        )
        body = listing.get("json") if isinstance(listing.get("json"), dict) else {}
        messages = body.get("messages") if isinstance(body.get("messages"), list) else []
        out: List[Dict[str, Any]] = []
        for item in messages[:safe_limit]:
            if not isinstance(item, dict):
                continue
            message_id = str(item.get("id") or "").strip()
            if not message_id:
                continue
            detail = http_json_request(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{quote_plus(message_id)}?format=full",
                headers={"Authorization": f"Bearer {str(credentials.get('access_token') or '').strip()}"},
                payload=None,
                timeout=20,
            )
            payload = detail.get("json") if isinstance(detail.get("json"), dict) else {}
            out.append(_gmail_message_summary(payload, message_id))
        return out

    if provider == "microsoft_365":
        payload = microsoft_graph_request(
            http_json_request,
            credentials,
            f"/me/mailFolders/inbox/messages?$top={safe_limit}&$select=id,subject,receivedDateTime,bodyPreview,from",
        )
        items = payload.get("value") if isinstance(payload.get("value"), list) else []
        return [
            {
                "id": item.get("id"),
                "threadId": None,
                "snippet": str(item.get("bodyPreview") or "").strip(),
                "subject": str(item.get("subject") or "").strip(),
                "from": str((((item.get("from") or {}).get("emailAddress") or {}).get("address")) or "").strip()
                if isinstance(item, dict)
                else "",
                "to": "",
                "date": str(item.get("receivedDateTime") or "").strip() if isinstance(item, dict) else "",
            }
            for item in items
            if isinstance(item, dict)
        ]

    raise RuntimeError(f"Recent message listing is unavailable for connector '{provider or 'unknown'}'.")


def _openai_env_bearer_with_source() -> tuple[str, str]:
    return _openai_env_bearer_with_source_impl(
        codex_oauth_token=CODEX_OAUTH_TOKEN,
        openai_oauth_token=OPENAI_OAUTH_TOKEN,
        openai_access_token=OPENAI_ACCESS_TOKEN,
        codex_vault_token=_codex_token_from_vault(),
        disable_openai_api_key=ORION_DISABLE_OPENAI_API_KEY,
        auth_mode=ORION_AUTH_MODE,
    )
