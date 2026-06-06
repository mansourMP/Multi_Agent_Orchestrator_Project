from server_modules import connection_catalog_service as service


def test_catalog_promotes_supported_work_app_connectors() -> None:
    payload = service.list_catalog_payload(surface="sage")
    by_id = {item["id"]: item for item in payload["items"]}

    for connection_id in ("dropbox", "s3", "smtp", "wechat_work", "instagram_business"):
        item = by_id[connection_id]
        assert item["lane"] == service.LANE_WORK_APP_CONNECTOR
        assert item["launch_status"] == service.LAUNCH_LIVE_WHEN_CONFIGURED
        assert item["setup_available"] is True
        assert item["runtime_usable"] is True
        assert item["launchable"] is True
        assert item["requires_gateway"] is False
        assert item["vault_provider"] == connection_id


def test_catalog_keeps_email_channel_partial_while_smtp_app_is_live() -> None:
    payload = service.list_catalog_payload()
    by_id = {item["id"]: item for item in payload["items"]}

    assert by_id["email"]["lane"] == service.LANE_STUDIO_BUSINESS_CHANNEL
    assert by_id["email"]["launch_status"] == service.LAUNCH_PARTIAL
    assert by_id["email"]["runtime_usable"] is False
    assert by_id["smtp"]["lane"] == service.LANE_WORK_APP_CONNECTOR
    assert by_id["smtp"]["launch_status"] == service.LAUNCH_LIVE_WHEN_CONFIGURED
