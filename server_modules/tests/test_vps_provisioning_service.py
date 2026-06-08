import base64
from unittest.mock import patch

import pytest

from server_modules import routes_gateway
from server_modules import vps_provisioning_service as vps


def test_cloud_init_script_runs_agent_computer_installer():
    script = vps.cloud_init_script("pair_test", api_url="https://api.example.com")

    assert script.startswith("#cloud-config")
    assert "curl -fsSL https://empyralis.ai/install/agent-computer.sh" in script
    assert "EMPYRALIS_PAIRING_TOKEN='pair_test'" in script
    assert "EMPYRALIS_API_URL='https://api.example.com'" in script
    assert "sudo -E bash" in script


def test_digitalocean_provisioning_payload_uses_curated_region(monkeypatch):
    calls = []

    def fake_http_json(method, url, *, token, payload, provider):
        calls.append(
            {
                "method": method,
                "url": url,
                "token": token,
                "payload": payload,
                "provider": provider,
            }
        )
        return {
            "droplet": {
                "id": 12345,
                "networks": {"v4": [{"type": "public", "ip_address": "203.0.113.10"}]},
            }
        }

    monkeypatch.setattr(vps, "_http_json", fake_http_json)

    result = vps.provision_vps(
        "digitalocean",
        {"api_token": "do_secret"},
        "lon1",
        None,
        "pair_do",
    )

    assert result.provider == "digitalocean"
    assert result.provider_resource_id == "12345"
    assert result.public_ip == "203.0.113.10"
    assert result.size == "s-1vcpu-2gb"
    assert calls[0]["url"] == "https://api.digitalocean.com/v2/droplets"
    assert calls[0]["token"] == "do_secret"
    assert calls[0]["payload"]["region"] == "lon1"
    assert calls[0]["payload"]["image"] == "ubuntu-24-04-x64"
    assert calls[0]["payload"]["user_data"].startswith("#cloud-config")


def test_vultr_provisioning_uses_current_ubuntu_2404_id_and_base64_user_data(monkeypatch):
    calls = []

    def fake_http_json(method, url, *, token, payload, provider):
        calls.append(payload)
        return {"instance": {"id": "vultr-1", "main_ip": "198.51.100.20"}}

    monkeypatch.setattr(vps, "_http_json", fake_http_json)

    result = vps.provision_vps("vultr", {"api_key": "vultr_secret"}, "syd", None, "pair_vultr")

    payload = calls[0]
    decoded_user_data = base64.b64decode(payload["user_data"]).decode("utf-8")
    assert result.provider == "vultr"
    assert result.provider_resource_id == "vultr-1"
    assert payload["region"] == "syd"
    assert payload["plan"] == "vc2-1c-2gb"
    assert payload["os_id"] == 2284
    assert decoded_user_data.startswith("#cloud-config")
    assert "EMPYRALIS_PAIRING_TOKEN='pair_vultr'" in decoded_user_data


def test_invalid_region_is_rejected_before_provider_call(monkeypatch):
    called = False

    def fake_http_json(*args, **kwargs):
        nonlocal called
        called = True
        return {}

    monkeypatch.setattr(vps, "_http_json", fake_http_json)

    with pytest.raises(ValueError):
        vps.provision_vps("hetzner", {"api_token": "secret"}, "free-text", None, "pair_hz")

    assert called is False


def test_vps_status_becomes_connected_when_gateway_registration_has_vps_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(vps, "VPS_STATE_FILE", tmp_path / "vps.json")
    monkeypatch.setattr(vps.vault_store, "_openssl_encrypt", lambda text: f"enc:{text}")
    monkeypatch.setattr(vps.vault_store, "_openssl_decrypt", lambda text: text.removeprefix("enc:"))
    monkeypatch.setattr(
        vps.gateway_state_repository,
        "list_workspace_gateway_registrations",
        lambda *args, **kwargs: [{"gateway_id": "gw-1", "metadata": {"vps_id": "vps_1"}}],
    )

    vps.record_vps_provision(
        vps_id="vps_1",
        workspace_id="ws-1",
        tenant_id="tenant-1",
        user_id="user-1",
        provider="hetzner",
        provider_resource_id="server-1",
        public_ip=None,
        region="fsn1",
        size="cx22",
        status="provisioning",
        pairing_token="pair_hz",
        credentials={"api_token": "secret"},
    )

    status = vps.get_vps_provision_status("vps_1")

    assert status["status"] == "connected"
    assert "credentials_ciphertext" not in status
    assert "pairing_token_ciphertext" not in status


@pytest.mark.asyncio
async def test_provision_hardware_vps_route_creates_pairing_then_records_vps():
    result = vps.VPSResult(
        provider_resource_id="droplet-1",
        public_ip="203.0.113.30",
        region="nyc3",
        size="s-1vcpu-2gb",
        status="provisioning",
        provider="digitalocean",
    )
    body = routes_gateway.HardwareVPSProvisionRequest(
        workspace_id="ws-1",
        provider="digitalocean",
        credentials={"api_token": "do_secret"},
        region="nyc3",
        size=None,
    )
    current_user = {"user_id": "user-1"}

    with (
        patch.object(routes_gateway, "enforce_workspace_access", return_value="ws-1") as access_mock,
        patch.object(routes_gateway, "workspace_tenant_id", return_value="tenant-1"),
        patch.object(
            routes_gateway.gateway_pairing_service,
            "create_gateway_pairing_intent",
            return_value={"pairing_token": "pair_do", "pairing_id": "pairing-1"},
        ) as pairing_mock,
        patch.object(routes_gateway.vps_provisioning_service, "provision_vps", return_value=result) as provision_mock,
        patch.object(routes_gateway.vps_provisioning_service, "record_vps_provision") as record_mock,
    ):
        response = await routes_gateway.provision_hardware_vps(body, current_user=current_user)

    assert response["pairing_token"] == "pair_do"
    assert response["vps_id"].startswith("vps_")
    assert response["provider_resource_id"] == "droplet-1"
    access_mock.assert_called_once_with(current_user, "ws-1", minimum_role="owner")
    assert pairing_mock.call_args.kwargs["metadata"]["setup_source"] == "vps"
    assert pairing_mock.call_args.kwargs["metadata"]["vps_id"] == response["vps_id"]
    assert provision_mock.call_args.args == (
        "digitalocean",
        {"api_token": "do_secret"},
        "nyc3",
        "s-1vcpu-2gb",
        "pair_do",
    )
    assert record_mock.call_args.kwargs["credentials"] == {"api_token": "do_secret"}
    assert record_mock.call_args.kwargs["vps_id"] == response["vps_id"]


@pytest.mark.asyncio
async def test_hardware_vps_status_route_enforces_workspace_access():
    with (
        patch.object(
            routes_gateway.vps_provisioning_service,
            "load_vps_record",
            return_value={
                "vps_id": "vps_1",
                "workspace_id": "ws-1",
                "provider": "hetzner",
                "provider_resource_id": "server-1",
                "public_ip": "203.0.113.40",
                "region": "fsn1",
                "size": "cx22",
                "status": "provisioning",
            },
        ),
        patch.object(routes_gateway, "enforce_workspace_access", return_value="ws-1") as access_mock,
        patch.object(
            routes_gateway.vps_provisioning_service,
            "get_vps_provision_status",
            return_value={
                "vps_id": "vps_1",
                "provider": "hetzner",
                "provider_resource_id": "server-1",
                "public_ip": "203.0.113.40",
                "region": "fsn1",
                "size": "cx22",
                "status": "connected",
            },
        ),
    ):
        response = await routes_gateway.get_hardware_vps_status("vps_1", current_user={"user_id": "user-1"})

    assert response["status"] == "connected"
    access_mock.assert_called_once_with({"user_id": "user-1"}, "ws-1", minimum_role="viewer")

