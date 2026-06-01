def _install_allow_gate(monkeypatch, rust_client):
    calls = []

    def allow_decision(**request):
        calls.append(request)
        return {
            "ok": True,
            "decision": "allow",
            "operation": request.get("operation"),
            "next_action": request.get("operation"),
        }

    def enforce(_command, decision):
        return decision

    monkeypatch.setattr(rust_client, "runtime_state_store_decision", allow_decision)
    monkeypatch.setattr(rust_client, "enforce_kernel_decision", enforce)
    return calls


def _install_gateway_action_allow_gate(monkeypatch, rust_client):
    calls = []

    def allow_decision(**request):
        calls.append(request)
        return {
            "ok": True,
            "decision": "allow",
            "operation": request.get("operation"),
            "next_action": "resolve_gateway_approval",
        }

    def enforce(_command, decision):
        return decision

    monkeypatch.setattr(rust_client, "gateway_action_decision", allow_decision)
    monkeypatch.setattr(rust_client, "enforce_kernel_decision", enforce)
    return calls


def test_gateway_approval_transition_calls_rust_gate(monkeypatch):
    from server_modules import gateway_approval_service

    calls = _install_allow_gate(monkeypatch, gateway_approval_service.rust_runtime_kernel_client)

    gateway_approval_service._enforce_gateway_approval_transition(
        operation="resolve_gateway_tool_approval",
        registration={
            "gateway_id": "gateway-1",
            "device_id": "device-1",
            "tenant_id": "tenant-1",
            "workspace_id": "workspace-1",
            "user_id": "user-1",
        },
        approval_id="approval-1",
        run_id="run-1",
        trace_id="trace-1",
        capability_id="browser.click",
        status="approved",
        decision="approved",
        payload={"actor": "owner"},
    )

    assert calls[0]["operation"] == "resolve_gateway_tool_approval"
    assert calls[0]["state_class"] == "gateway_approvals"
    assert calls[0]["tenant_id"] == "tenant-1"
    assert calls[0]["workspace_id"] == "workspace-1"
    assert calls[0]["run_id"] == "run-1"
    assert calls[0]["payload"]["approval_id"] == "approval-1"


def test_gateway_approval_transition_blocks_with_domain_error(monkeypatch):
    from server_modules import gateway_approval_service
    from server_modules import rust_runtime_kernel_client

    def block_decision(**request):
        return {
            "ok": False,
            "decision": "block",
            "operation": request.get("operation"),
            "reason": "gateway_approval_denied",
        }

    def enforce(_command, decision):
        raise rust_runtime_kernel_client.RustKernelDecisionError(
            "runtime-state-store-decision",
            decision,
        )

    monkeypatch.setattr(gateway_approval_service.rust_runtime_kernel_client, "runtime_state_store_decision", block_decision)
    monkeypatch.setattr(gateway_approval_service.rust_runtime_kernel_client, "enforce_kernel_decision", enforce)

    try:
        gateway_approval_service._enforce_gateway_approval_transition(
            operation="create_gateway_tool_approval",
            registration={"tenant_id": "tenant-1", "workspace_id": "workspace-1"},
            run_id="run-1",
            capability_id="browser.click",
            status="pending",
            decision="requested",
        )
    except gateway_approval_service.GatewayApprovalRustGateError as exc:
        assert str(exc) == "gateway_approval_denied"
    else:
        raise AssertionError("expected gateway approval gate to fail closed")


def test_gateway_approval_transition_unexpected_next_action_blocks(monkeypatch):
    from server_modules import gateway_approval_service

    def allow_wrong_action(**request):
        return {
            "ok": True,
            "decision": "allow",
            "operation": request.get("operation"),
            "next_action": "execute_gateway_tool_approval",
        }

    def enforce(_command, decision):
        return decision

    monkeypatch.setattr(gateway_approval_service.rust_runtime_kernel_client, "runtime_state_store_decision", allow_wrong_action)
    monkeypatch.setattr(gateway_approval_service.rust_runtime_kernel_client, "enforce_kernel_decision", enforce)

    try:
        gateway_approval_service._enforce_gateway_approval_transition(
            operation="resolve_gateway_tool_approval",
            registration={"tenant_id": "tenant-1", "workspace_id": "workspace-1"},
            approval_id="approval-1",
            run_id="run-1",
            capability_id="browser.click",
            status="approved",
            decision="approved",
        )
    except gateway_approval_service.GatewayApprovalRustGateError as exc:
        assert "unexpected next_action" in str(exc)
    else:
        raise AssertionError("expected gateway approval gate to fail closed on wrong next_action")


def test_gateway_approval_action_calls_rust_gate(monkeypatch):
    from server_modules import gateway_approval_service

    calls = _install_gateway_action_allow_gate(
        monkeypatch,
        gateway_approval_service.rust_runtime_kernel_client,
    )

    gateway_approval_service._enforce_gateway_approval_action_decision(
        registration={
            "gateway_id": "gateway-1",
            "tenant_id": "tenant-1",
            "workspace_id": "workspace-1",
        },
        approval_id="approval-1",
        run_id="run-1",
        trace_id="trace-1",
        capability_id="browser.click",
        request_id="request-1",
    )

    assert calls[0]["operation"] == "approval_resolve"
    assert calls[0]["approval_id"] == "approval-1"
    assert calls[0]["gateway_id"] == "gateway-1"
    assert calls[0]["actor_role"] == "owner"


def test_gateway_approval_action_unexpected_next_action_blocks(monkeypatch):
    from server_modules import gateway_approval_service

    def allow_wrong_action(**request):
        return {
            "ok": True,
            "decision": "allow",
            "operation": request.get("operation"),
            "next_action": "dispatch_browser_action",
        }

    def enforce(_command, decision):
        return decision

    monkeypatch.setattr(gateway_approval_service.rust_runtime_kernel_client, "gateway_action_decision", allow_wrong_action)
    monkeypatch.setattr(gateway_approval_service.rust_runtime_kernel_client, "enforce_kernel_decision", enforce)

    try:
        gateway_approval_service._enforce_gateway_approval_action_decision(
            registration={"tenant_id": "tenant-1", "workspace_id": "workspace-1", "gateway_id": "gateway-1"},
            approval_id="approval-1",
        )
    except gateway_approval_service.GatewayApprovalRustGateError as exc:
        assert "unexpected next_action" in str(exc)
    else:
        raise AssertionError("expected gateway approval action gate to fail closed on wrong next_action")


def test_resolve_gateway_tool_approval_blocks_before_atomic_resolve_on_wrong_action(monkeypatch):
    from server_modules import gateway_approval_service

    approval = {
        "approval_id": "approval-1",
        "gateway_id": "gateway-1",
        "capability_id": "browser.click",
        "run_id": "run-1",
        "trace_id": "trace-1",
        "request_id": "request-1",
        "status": "pending",
        "request_payload": {},
    }

    def allow_wrong_action(**request):
        return {
            "ok": True,
            "decision": "allow",
            "operation": request.get("operation"),
            "next_action": "request_gateway_browser_approval",
        }

    def enforce(_command, decision):
        return decision

    monkeypatch.setattr(gateway_approval_service.gateway_state_repository, "get_gateway_action_approval", lambda approval_id: dict(approval))
    monkeypatch.setattr(gateway_approval_service.rust_runtime_kernel_client, "gateway_action_decision", allow_wrong_action)
    monkeypatch.setattr(gateway_approval_service.rust_runtime_kernel_client, "enforce_kernel_decision", enforce)
    monkeypatch.setattr(
        gateway_approval_service.gateway_state_repository,
        "resolve_gateway_action_approval_atomic",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("should not resolve approval")),
    )

    async def _run():
        try:
            await gateway_approval_service.resolve_gateway_tool_approval(
                registration={"gateway_id": "gateway-1", "tenant_id": "tenant-1", "workspace_id": "workspace-1"},
                approval_id="approval-1",
                decision="approved",
                actor="owner-1",
            )
        except gateway_approval_service.GatewayApprovalRustGateError as exc:
            assert "unexpected next_action" in str(exc)
        else:
            raise AssertionError("expected approval resolution to fail closed")

    import asyncio

    asyncio.run(_run())
