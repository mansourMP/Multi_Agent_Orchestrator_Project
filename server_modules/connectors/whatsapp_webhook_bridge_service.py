from __future__ import annotations

from typing import Any, Callable, Dict


class WhatsAppWebhookBridgeService:
    def __init__(
        self,
        *,
        init_runtime: Callable[[], None],
        parse_form_urlencoded: Callable[[bytes], Dict[str, str]],
        webhook_result: Callable[..., Dict[str, Any]],
        handle_inbound: Callable[[Dict[str, str]], Any],
        twiml_response: Callable[[str], Any],
        forbidden_response: Callable[[str], Any],
        enabled: bool,
        configured_secret: str,
    ) -> None:
        self.init_runtime = init_runtime
        self.parse_form_urlencoded = parse_form_urlencoded
        self.webhook_result = webhook_result
        self.handle_inbound = handle_inbound
        self.twiml_response = twiml_response
        self.forbidden_response = forbidden_response
        self.enabled = bool(enabled)
        self.configured_secret = str(configured_secret or "").strip()

    def handle_webhook(
        self,
        *,
        raw_body: bytes,
        query_secret: str = "",
        header_secret: str = "",
    ) -> Any:
        self.init_runtime()
        form = self.parse_form_urlencoded(raw_body)
        provided_secret = str(query_secret or header_secret or "").strip()
        result = self.webhook_result(
            enabled=self.enabled,
            configured_secret=self.configured_secret,
            provided_secret=provided_secret,
            form=form,
            handle_inbound=self.handle_inbound,
        )
        if int(result.get("status_code") or 200) == 403:
            return self.forbidden_response(str(result.get("content") or "forbidden"))
        return self.twiml_response(str(result.get("text") or ""))
