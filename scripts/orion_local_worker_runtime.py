import json
import urllib.error
import urllib.request
from typing import Any, Dict, Optional


def ensure_trailing_slashless(url: str) -> str:
    return str(url or "").rstrip("/")


class RateLimitError(RuntimeError):
    def __init__(self, message: str, retry_after_seconds: int = 1):
        super().__init__(message)
        self.retry_after_seconds = max(1, int(retry_after_seconds))


class RuntimeClient:
    def __init__(self, base_url: str, api_key: str, timeout_seconds: int = 20):
        self.base_url = ensure_trailing_slashless(base_url)
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    def _request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        body = None
        headers = {"X-API-Key": self.api_key}
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url=url, data=body, method=method.upper(), headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                text = response.read().decode("utf-8") if response else ""
                if not text:
                    return {}
                parsed = json.loads(text)
                return parsed if isinstance(parsed, dict) else {}
        except urllib.error.HTTPError as exc:
            try:
                raw = exc.read().decode("utf-8")
            except Exception:
                raw = ""
            detail = raw or str(exc)
            retry_after_header = exc.headers.get("Retry-After") if exc.headers is not None else None
            retry_after_seconds = 1
            if retry_after_header:
                try:
                    retry_after_seconds = max(1, int(str(retry_after_header).strip()))
                except Exception:
                    retry_after_seconds = 1
            parsed_detail: Optional[Dict[str, Any]] = None
            try:
                parsed_candidate = json.loads(detail) if detail else None
                if isinstance(parsed_candidate, dict):
                    parsed_detail = parsed_candidate
            except Exception:
                parsed_detail = None
            if parsed_detail and isinstance(parsed_detail.get("retry_after_seconds"), (int, float)):
                retry_after_seconds = max(1, int(parsed_detail.get("retry_after_seconds")))
            if exc.code == 429:
                raise RateLimitError(f"{method} {path} failed: {detail}", retry_after_seconds=retry_after_seconds) from exc
            raise RuntimeError(f"{method} {path} failed: {detail}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"{method} {path} failed: {exc}") from exc

    def claim_run(self, worker_id: str) -> Dict[str, Any]:
        return self._request("POST", "/local/runs/claim", {"worker_id": worker_id})

    def heartbeat_run(self, run_id: str, worker_id: str, note: str):
        self._request(
            "POST",
            f"/local/runs/{run_id}/heartbeat",
            {"worker_id": worker_id, "note": note[:300]},
        )

    def complete_run(
        self,
        run_id: str,
        worker_id: str,
        result_text: str,
        result_data: Optional[Dict[str, Any]] = None,
        usage_masked: Optional[Dict[str, Any]] = None,
    ):
        payload: Dict[str, Any] = {"worker_id": worker_id, "result_text": result_text}
        if isinstance(result_data, dict):
            payload["result_data"] = result_data
        if isinstance(usage_masked, dict):
            payload["usage_masked"] = usage_masked
        self._request("POST", f"/local/runs/{run_id}/complete", payload)

    def fail_run(self, run_id: str, worker_id: str, error_message: str):
        self._request("POST", f"/local/runs/{run_id}/fail", {"worker_id": worker_id, "error": error_message[:1000]})

    def heartbeat_worker(self, worker_id: str, current_run_id: Optional[str], note: str):
        payload: Dict[str, Any] = {"note": note[:240]}
        if current_run_id:
            payload["current_run_id"] = current_run_id
        self._request("POST", f"/local/workers/{worker_id}/heartbeat", payload)
