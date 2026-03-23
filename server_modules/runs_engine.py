from server_modules import runtime_config as config
from server_modules import shared as shared
from server_modules import runtime_common as common
from server_modules.runs_history import _append_approval_audit
from server_modules.runs_output import _compact_event_text, _json_safe

globals().update({key: value for key, value in vars(config).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(shared).items() if not key.startswith("__")})
globals().update({key: value for key, value in vars(common).items() if not key.startswith("__")})

configure_runtime_model_context(
    memory_max_text_chars=ORION_MEMORY_MAX_TEXT_CHARS,
    normalize_memory_bucket=_normalize_memory_bucket,
    normalize_action_id=normalize_action_id,
    provider_catalog=PROVIDER_CATALOG,
    connector_catalog=CONNECTOR_CATALOG,
)


def format_agent_summary(agents: Any) -> str:
    if not isinstance(agents, list) or not agents:
        return "- none"

    lines: List[str] = []
    for agent in agents:
        if not isinstance(agent, dict):
            continue
        role = str(agent.get("role") or "Worker")
        model = str(agent.get("modelId") or "unknown-model")
        provider = str(agent.get("provider") or "unknown-provider")
        duty = str(agent.get("duty") or agent.get("description") or "").strip()
        if duty:
            lines.append(f"- {role} ({provider}:{model}) duty={duty[:120]}")
        else:
            lines.append(f"- {role} ({provider}:{model})")
    return "\n".join(lines) if lines else "- none"


def resolve_run_execution_context(context: Dict[str, Any]):
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    provider = normalize_provider_id(context.get("provider") or metadata.get("provider") or "openai")
    if provider not in PROVIDER_CATALOG:
        raise RuntimeError(f"Unsupported provider '{provider}'")

    workspace_id = context.get("workspace_id") or metadata.get("workspace_id")
    credential_id = context.get("credential_id") or metadata.get("credential_id")
    selected_model = (
        context.get("model")
        or metadata.get("model")
        or PROVIDER_CATALOG.get(provider, {}).get("default_model")
        or CODEX_MODEL
    )
    candidate_context = dict(context)
    candidate_context["credential_id"] = credential_id
    candidate_context["workspace_id"] = workspace_id
    candidates = _build_provider_credential_candidates(candidate_context, metadata, provider)
    if not candidates:
        raise RuntimeError(f"No credentials available for provider '{provider}'.")

    return provider, str(selected_model), candidates, metadata


def generate_with_candidate_failover(
    state: Dict[str, Any],
    context: Dict[str, Any],
    log_queue: queue.Queue,
    system_prompt: str,
    user_input: str,
) -> str:
    from server_modules.runs_core import emit_log

    provider = str(state.get("provider") or "openai").strip().lower()
    default_model = str(state.get("selected_model") or CODEX_MODEL).strip() or CODEX_MODEL
    candidates = state.get("credential_candidates") if isinstance(state.get("credential_candidates"), list) else []
    if not candidates:
        raise RuntimeError(f"No credentials available for provider '{provider}'.")

    last_error: Optional[Exception] = None
    for idx, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            continue
        credentials = candidate.get("credentials") if isinstance(candidate.get("credentials"), dict) else {}
        if not credentials:
            continue
        model = str(candidate.get("model") or default_model).strip() or default_model
        profile_id = str(candidate.get("profile_id") or "").strip() or None
        source = str(candidate.get("source") or "unknown").strip()
        try:
            resolved_provider, adapter_key, adapter = resolve_provider_adapter(provider, credentials)
            text = adapter.generate(system_prompt, user_input, model, credentials)
            if profile_id:
                _mark_profile_success(profile_id)
            state["active_candidate_index"] = idx
            state["active_profile_id"] = profile_id
            state["active_model"] = model
            state["active_provider"] = resolved_provider
            state["active_adapter"] = adapter_key
            state["credentials"] = credentials
            if idx > 0:
                emit_log(
                    log_queue,
                    "warn",
                    f"Provider failover succeeded using candidate {idx + 1} ({source}).",
                    event="profile_failover",
                    data={"provider": provider, "profile_id": profile_id, "candidate_index": idx, "source": source},
                )
            return text
        except Exception as exc:
            last_error = exc
            raw_error = str(exc)
            if profile_id:
                _mark_profile_failure(profile_id, raw_error)
            emit_log(
                log_queue,
                "warn",
                f"Provider candidate failed ({source}): {friendly_runtime_error_message(exc)}",
                event="profile_candidate_failed",
                data={
                    "provider": provider,
                    "profile_id": profile_id,
                    "candidate_index": idx,
                    "source": source,
                    "error": raw_error[:800],
                },
            )
            continue
    if last_error is not None:
        raise last_error
    raise RuntimeError(f"No usable credentials remained for provider '{provider}'.")


def requires_human_approval(context: Dict[str, Any], plan_text: str) -> tuple[bool, str]:
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    trust_mode = normalize_trust_mode(metadata.get("trust_mode"))
    if trust_mode == TRUST_MODE_AUTO:
        return False, ""
    if trust_mode == TRUST_MODE_STRICT:
        return True, "Strict mode requires explicit approval before execution."

    raw = " ".join(
        [
            str(context.get("user_goal") or ""),
            str(context.get("business_plan") or ""),
            str(plan_text or ""),
        ]
    ).lower()

    matched = [kw for kw in RISKY_ACTION_KEYWORDS if kw in raw]
    if trust_mode == TRUST_MODE_SENSITIVE_GUARD:
        if matched:
            return True, f"Sensitive Guard detected sensitive actions ({', '.join(sorted(set(matched))[:4])})."
        return False, ""
    if trust_mode == TRUST_MODE_COST_GUARD:
        if len(matched) >= 2:
            return True, f"Cost Guard detected multiple potentially expensive actions ({', '.join(sorted(set(matched))[:4])})."
        return False, ""
    if matched:
        return True, f"Potentially risky actions detected ({', '.join(sorted(set(matched))[:4])})."
    return False, ""


def wait_for_human_decision(run_id: str, prompt: str) -> bool:
    from server_modules.runs_core import _begin_run_pending_approval, emit_log, set_run_status

    run = runs[run_id]
    pending_payload = _begin_run_pending_approval(
        run_id,
        prompt,
        source="runtime_wait",
        emit_pause_required=True,
    )
    approval_id = str(pending_payload.get("approval_id") or "").strip()
    correlation_id = str(pending_payload.get("correlation_id") or "").strip()
    ttl_seconds = int(pending_payload.get("ttl_seconds") or ORION_APPROVAL_TTL_SECONDS)
    approve_tokens = {"proceed", "approve", "yes", "y", "continue", "ok"}
    reject_tokens = {"hold", "reject", "no", "n", "abort", "stop", "cancel"}
    escalate_tokens = {"escalate", "escalated"}
    deadline = time.monotonic() + ttl_seconds
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            pending = run.get("pending_approval") if isinstance(run.get("pending_approval"), dict) else {}
            pending["status"] = "expired"
            pending["expired_at"] = _utc_now_iso()
            run["pending_approval"] = pending
            emit_log(
                run["logs"],
                "error",
                "Approval request expired before user decision.",
                event="approval_timeout",
                data={"approval_id": approval_id, "correlation_id": correlation_id, "ttl_seconds": ttl_seconds},
            )
            _append_approval_audit(
                approval_id=approval_id,
                stage="timeout",
                decision="timeout",
                actor="system",
                source="runtime_wait",
                run_id=run_id,
                note="Approval timeout reached while waiting for user decision.",
                correlation_id=correlation_id,
            )
            raise RuntimeError("Approval timeout reached while waiting for user decision.")
        try:
            decision_raw = run["input_queue"].get(timeout=remaining)
        except queue.Empty:
            continue

        incoming_approval_id: Optional[str] = None
        decision_text = ""
        if isinstance(decision_raw, dict):
            incoming_approval_id = str(decision_raw.get("approval_id") or "").strip() or None
            decision_text = str(decision_raw.get("decision") or "").strip().lower()
        else:
            decision_text = str(decision_raw or "").strip().lower()

        if incoming_approval_id and incoming_approval_id != approval_id:
            emit_log(
                run["logs"],
                "warn",
                "Ignored stale approval resolution for different approval_id.",
                event="approval_ignored",
                data={
                    "approval_id": incoming_approval_id,
                    "expected_approval_id": approval_id,
                    "correlation_id": correlation_id,
                },
            )
            _append_approval_audit(
                approval_id=incoming_approval_id,
                stage="ignored",
                decision="ignored",
                actor="runtime",
                source="runtime_wait",
                run_id=run_id,
                note=f"Expected approval_id={approval_id}",
                correlation_id=correlation_id,
                metadata={"expected_approval_id": approval_id},
            )
            continue

        pending = run.get("pending_approval") if isinstance(run.get("pending_approval"), dict) else {}
        pending["status"] = "resolved"
        pending["resolved_at"] = _utc_now_iso()
        pending["decision"] = decision_text
        run["pending_approval"] = pending
        set_run_status(run_id, "running")
        emit_log(
            run["logs"],
            "info",
            f"Decision received: {decision_text}",
            event="approval_received",
            data={"approval_id": approval_id, "correlation_id": correlation_id, "decision": decision_text},
        )
        _append_approval_audit(
            approval_id=approval_id,
            stage="received",
            decision=decision_text,
            actor="user",
            source="runtime_wait",
            run_id=run_id,
            note=str(decision_raw),
            correlation_id=correlation_id,
        )

        approved = decision_text in approve_tokens
        rejected = decision_text in reject_tokens
        escalated = decision_text in escalate_tokens
        if not approved and not rejected and not escalated:
            rejected = True
        emit_log(
            run["logs"],
            "info" if approved else "warn",
            "Approval resolved.",
            event="approval_resolved",
            data={
                "approval_id": approval_id,
                "correlation_id": correlation_id,
                "decision": decision_text,
                "approved": approved,
                "rejected": bool(rejected),
                "escalated": bool(escalated),
            },
        )
        _append_approval_audit(
            approval_id=approval_id,
            stage="resolved",
            decision=("approved" if approved else "escalated" if escalated else "rejected"),
            actor="runtime",
            source="runtime_wait",
            run_id=run_id,
            correlation_id=correlation_id,
            metadata={
                "raw_decision": decision_text,
                "approved": bool(approved),
                "rejected": bool(rejected),
                "escalated": bool(escalated),
            },
        )
        run["pending_approval"] = None
        return approved

def validate_orion_runtime() -> List[str]:
    errors: List[str] = []
    if ORION_RUN_TIMEOUT_SECONDS <= 0:
        errors.append("ORION_RUN_TIMEOUT_SECONDS must be > 0.")
    if ORION_MAX_RETRIES < 0:
        errors.append("ORION_MAX_RETRIES cannot be negative.")
    if ORION_RETRY_BACKOFF_SECONDS < 0:
        errors.append("ORION_RETRY_BACKOFF_SECONDS cannot be negative.")
    if ORION_MAX_EVENT_BUFFER <= 0:
        errors.append("ORION_MAX_EVENT_BUFFER must be > 0.")
    if ORION_HISTORY_LIMIT <= 0:
        errors.append("ORION_HISTORY_LIMIT must be > 0.")
    if ORION_CHANNEL_EVENTS_LIMIT <= 0:
        errors.append("ORION_CHANNEL_EVENTS_LIMIT must be > 0.")
    if ORION_SCHEDULER_POLL_SECONDS < 5:
        errors.append("ORION_SCHEDULER_POLL_SECONDS must be >= 5.")
    if ORION_APPROVAL_TTL_SECONDS < 30:
        errors.append("ORION_APPROVAL_TTL_SECONDS must be >= 30.")
    if ORION_SETUP_SESSION_TTL_SECONDS < 300:
        errors.append("ORION_SETUP_SESSION_TTL_SECONDS must be >= 300.")
    if ORION_IDEMPOTENCY_TTL_SECONDS < 60:
        errors.append("ORION_IDEMPOTENCY_TTL_SECONDS must be >= 60.")
    if CONTROL_PLANE_RATE_LIMIT_PER_MINUTE <= 0:
        errors.append("CONTROL_PLANE_RATE_LIMIT_PER_MINUTE must be > 0.")
    if CONTROL_PLANE_RATE_LIMIT_BURST < 0:
        errors.append("CONTROL_PLANE_RATE_LIMIT_BURST cannot be negative.")
    if ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS < 1:
        errors.append("ORION_TELEGRAM_AUTOPILOT_POLL_SECONDS must be >= 1.")
    if ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES <= 0:
        errors.append("ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES must be > 0.")
    if ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES > 100:
        errors.append("ORION_TELEGRAM_AUTOPILOT_MAX_UPDATES must be <= 100.")
    if ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS < 30:
        errors.append("ORION_TELEGRAM_AUTOPILOT_RUN_TIMEOUT_SECONDS must be >= 30.")
    if ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS < 120:
        errors.append("ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS must be >= 120.")
    if ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS > 6000:
        errors.append("ORION_TELEGRAM_AUTOPILOT_MAX_REPLY_CHARS must be <= 6000.")
    target_raw = str(ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET or "").strip().lower()
    valid_target_inputs = VALID_EXECUTION_TARGETS.union(
        {"local", "local-worker", "local_worker", "companion", "localcompanion", "server", "managed", "hybrid"}
    )
    if target_raw and target_raw not in valid_target_inputs:
        errors.append("ORION_TELEGRAM_AUTOPILOT_EXECUTION_TARGET is invalid.")
    trust_raw = str(ORION_TELEGRAM_AUTOPILOT_TRUST_MODE or "").strip().lower()
    valid_trust_inputs = set(TRUST_MODE_ALIASES.keys()).union(VALID_TRUST_MODES)
    if trust_raw and trust_raw not in valid_trust_inputs:
        errors.append("ORION_TELEGRAM_AUTOPILOT_TRUST_MODE is invalid.")
    if ORION_TELEGRAM_AUTOPILOT_PROFILE and ORION_TELEGRAM_AUTOPILOT_PROFILE not in TELEGRAM_AUTOPILOT_PROFILE_CATALOG:
        errors.append("ORION_TELEGRAM_AUTOPILOT_PROFILE is invalid.")
    if ORION_TELEGRAM_AUTOPILOT_ENGINE and ORION_TELEGRAM_AUTOPILOT_ENGINE not in ENGINE_REGISTRY:
        errors.append("ORION_TELEGRAM_AUTOPILOT_ENGINE is invalid.")
    if ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS < 30:
        errors.append("ORION_WHATSAPP_AUTOPILOT_RUN_TIMEOUT_SECONDS must be >= 30.")
    if ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS < 120:
        errors.append("ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS must be >= 120.")
    if ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS > 6000:
        errors.append("ORION_WHATSAPP_AUTOPILOT_MAX_REPLY_CHARS must be <= 6000.")
    whatsapp_target_raw = str(ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET or "").strip().lower()
    valid_target_inputs = VALID_EXECUTION_TARGETS.union(
        {"local", "local-worker", "local_worker", "companion", "localcompanion", "server", "managed", "hybrid"}
    )
    if whatsapp_target_raw and whatsapp_target_raw not in valid_target_inputs:
        errors.append("ORION_WHATSAPP_AUTOPILOT_EXECUTION_TARGET is invalid.")
    whatsapp_trust_raw = str(ORION_WHATSAPP_AUTOPILOT_TRUST_MODE or "").strip().lower()
    valid_trust_inputs = set(TRUST_MODE_ALIASES.keys()).union(VALID_TRUST_MODES)
    if whatsapp_trust_raw and whatsapp_trust_raw not in valid_trust_inputs:
        errors.append("ORION_WHATSAPP_AUTOPILOT_TRUST_MODE is invalid.")
    if ORION_WHATSAPP_AUTOPILOT_PROFILE and ORION_WHATSAPP_AUTOPILOT_PROFILE not in WHATSAPP_AUTOPILOT_PROFILE_CATALOG:
        errors.append("ORION_WHATSAPP_AUTOPILOT_PROFILE is invalid.")
    if ORION_WHATSAPP_AUTOPILOT_ENGINE and ORION_WHATSAPP_AUTOPILOT_ENGINE not in ENGINE_REGISTRY:
        errors.append("ORION_WHATSAPP_AUTOPILOT_ENGINE is invalid.")
    if not PROVIDER_ADAPTERS:
        errors.append("No provider adapters are registered.")
    return errors


class OrionEngineAdapter:
    name = "orion"

    def execute(self, run_id: str):
        run_orion_mission(run_id)


def extract_openai_text(payload: Dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str) and payload.get("output_text"):
        return payload["output_text"]

    output = payload.get("output") or []
    text_parts: List[str] = []
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content") or []
            if isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    block_text = block.get("text")
                    if isinstance(block_text, str) and block_text.strip():
                        text_parts.append(block_text.strip())
            item_text = item.get("text")
            if isinstance(item_text, str) and item_text.strip():
                text_parts.append(item_text.strip())

    if text_parts:
        return "\n".join(text_parts)

    choices = payload.get("choices") or []
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            message = first.get("message") or {}
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str) and content.strip():
                    return content
    return json.dumps(payload)


def call_openai_responses(system_prompt: str, user_input: str) -> Dict[str, Any]:
    openai_key, _ = _openai_env_bearer_with_source()
    if not openai_key:
        raise RuntimeError(
            "OpenAI credential is missing "
            "(CODEX_OAUTH_TOKEN / OPENAI_OAUTH_TOKEN / OPENAI_ACCESS_TOKEN"
            " / OPENAI_API_KEY)."
        )

    try:
        from server_modules.model_router import call_model_sync

        result = call_model_sync(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_input},
            ],
            model=CODEX_MODEL,
            provider="openai",
            credentials={
                "access_token": openai_key,
                "org_id": OPENAI_ORG_ID,
                "project_id": OPENAI_PROJECT_ID,
            },
        )
        return {
            "output_text": result.get("content") or "",
            "model": result.get("model") or CODEX_MODEL,
            "usage": result.get("usage") or {},
        }
    except Exception as exc:
        raise RuntimeError(f"OpenAI responses call failed: {exc}") from exc


class CodexEngineAdapter:
    name = "codex"

    def execute(self, run_id: str):
        run = runs[run_id]
        run["thread_id"] = threading.get_ident()
        log_queue = run["logs"]
        context = run.get("context", {})

        try:
            set_run_status(run_id, "running")
            emit_log(log_queue, "info", f"Codex run started.", event="run_start", data={"run_id": run_id})

            workflow_id = context.get("workflow_id")
            metadata = context.get("metadata") or {}
            workspace_id = context.get("workspace_id") or metadata.get("workspace_id")
            user_goal = context.get("user_goal") or "Execute the requested business plan."
            business_plan = context.get("business_plan") or ""
            agents = context.get("agents") or []

            provider = normalize_provider_id(context.get("provider") or metadata.get("provider") or "openai")
            if provider not in PROVIDER_CATALOG:
                raise RuntimeError(f"Unsupported provider '{provider}'")

            credential_id = context.get("credential_id") or metadata.get("credential_id")
            selected_model = context.get("model") or metadata.get("model") or PROVIDER_CATALOG.get(provider, {}).get("default_model") or CODEX_MODEL

            credentials: Dict[str, Any] = {}
            if credential_id:
                credentials = resolve_vault_credential(str(credential_id), str(workspace_id) if workspace_id else None)
            elif isinstance(metadata.get("credentials"), dict):
                credentials = metadata.get("credentials") or {}
            elif provider == "openai":
                try:
                    credentials = resolve_default_vault_credential("openai", str(workspace_id) if workspace_id else None)
                except Exception:
                    openai_key, _ = _openai_env_bearer_with_source()
                    if openai_key:
                        credentials = {
                            "access_token": openai_key,
                            "org_id": OPENAI_ORG_ID,
                            "project_id": OPENAI_PROJECT_ID,
                        }

            if not credentials:
                raise RuntimeError(f"No credentials available for provider '{provider}'.")

            agent_summary = (
                [
                    f"- {agent.get('role', 'Worker')} ({agent.get('provider', 'unknown-provider')}:{agent.get('modelId', 'unknown-model')})"
                    for agent in agents
                    if isinstance(agent, dict)
                ]
                if isinstance(agents, list)
                else []
            )
            wants_structured_plan = bool((business_plan or "").strip()) or bool(
                re.search(r"\b(plan|roadmap|strategy|steps|phase|milestone|architecture|execution plan)\b", (user_goal or "").strip().lower())
            )
            available_agents = chr(10).join(agent_summary) if agent_summary else "- none"
            memory_context_block = _memory_prompt_context_block(context)
            response_contract = (
                "Provide: 1) ordered steps, 2) immediate external actions, 3) key risks/unknowns."
                if wants_structured_plan
                else "Respond as a normal assistant (not a forced plan template). For greeting/chat reply naturally and briefly; for work requests give direct actionable help; ask clarifying questions only when required."
            )
            user_message = (
                f"Workflow ID: {workflow_id or 'n/a'}\nUser Request: {user_goal}\n\n"
                f"Business Plan Context:\n{business_plan or 'No business plan provided.'}\n\n"
                f"{memory_context_block}\n\n"
                f"Selected Provider: {provider}\nSelected Model: {selected_model}\n\nAvailable Agents:\n{available_agents}\n\n{response_contract}"
            )

            system_prompt = ORION_CODEX_SYSTEM_PROMPT
            _, _, adapter = resolve_provider_adapter(provider, credentials)
            text = adapter.generate(system_prompt, user_message, str(selected_model), credentials)
            usage = build_masked_usage(provider, str(selected_model), user_message, text)
            usage_message = (
                f"[Telemetry] provider={usage['provider']} model={usage['model']} "
                f"tokens~{usage['total_tokens_est']} cost={usage['cost_band']}"
            )

            emit_log(log_queue, "info", text, event="codex_output")
            emit_log(log_queue, "info", usage_message, event="usage_masked", data=usage)
            emit_log(log_queue, "info", "Codex run completed.", event="run_complete")
            run["result"] = text
            run["usage_masked"] = usage
            set_run_status(run_id, "completed")
        except Exception as exc:
            emit_log(log_queue, "error", str(exc), event="run_error")
            set_run_status(run_id, "failed")
        finally:
            log_queue.put(None)


ENGINE_REGISTRY = {
    "orion": OrionEngineAdapter(),
    "codex": CodexEngineAdapter(),
}

ORION_ENGINE_VALIDATION_ERRORS = validate_orion_runtime()
if ORION_ENGINE_VALIDATION_ERRORS:
    print("⚠️ Empyralis runtime validation failed:")
    for err in ORION_ENGINE_VALIDATION_ERRORS:
        print(f" - {err}")
