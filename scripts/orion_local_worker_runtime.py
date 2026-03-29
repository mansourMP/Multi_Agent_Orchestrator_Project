import json
import hashlib
import urllib.error
import urllib.request
from typing import Any, Dict, Optional


def ensure_trailing_slashless(url: str) -> str:
    return str(url or "").rstrip("/")


class RateLimitError(RuntimeError):
    def __init__(self, message: str, retry_after_seconds: int = 1):
        super().__init__(message)
        self.retry_after_seconds = max(1, int(retry_after_seconds))


class ApiRequestError(RuntimeError):
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class RuntimeClient:
    def __init__(self, base_url: str, api_key: str, timeout_seconds: int = 20):
        self.base_url = ensure_trailing_slashless(base_url)
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds
        self.runtime_session_token: Optional[str] = None
        self.runtime_instance_id: Optional[str] = None
        self._registration: Optional[Dict[str, Any]] = None

    def _capability_digest(self, capabilities: Optional[list[str]]) -> Optional[str]:
        items = [str(item).strip() for item in (capabilities or []) if str(item).strip()]
        if not items:
            return None
        return hashlib.sha256("\n".join(sorted(set(items))).encode("utf-8")).hexdigest()[:16]

    def _retry_with_reregister(self, runtime_id: str, fn):
        try:
            return fn()
        except ApiRequestError as exc:
            if exc.status_code not in {401, 404, 409}:
                raise
            registration = self._registration if isinstance(self._registration, dict) else None
            if not registration or str(registration.get("runtime_id") or "").strip() != runtime_id:
                raise
            self.register_runtime(
                runtime_id,
                runtime_type=str(registration.get("runtime_type") or "local"),
                display_name=str(registration.get("display_name") or "") or None,
                platform=str(registration.get("platform") or "") or None,
                capabilities=list(registration.get("capabilities") or []),
                execution_targets=list(registration.get("execution_targets") or []),
                instance_id=str(registration.get("instance_id") or "") or None,
            )
            return fn()

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
            raise ApiRequestError(f"{method} {path} failed: {detail}", status_code=exc.code) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"{method} {path} failed: {exc}") from exc

    def _request_with_fallback(
        self,
        method: str,
        primary_path: str,
        fallback_path: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        try:
            return self._request(method, primary_path, payload)
        except ApiRequestError as exc:
            if exc.status_code not in {404, 405}:
                raise
            return self._request(method, fallback_path, payload)

    def register_runtime(
        self,
        runtime_id: str,
        *,
        runtime_type: str = "local",
        display_name: Optional[str] = None,
        platform: Optional[str] = None,
        policy_mode: str = "local_default",
        capabilities: Optional[list[str]] = None,
        execution_targets: Optional[list[str]] = None,
        instance_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        effective_instance_id = str(instance_id or self.runtime_instance_id or runtime_id).strip() or runtime_id
        payload: Dict[str, Any] = {
            "runtime_type": runtime_type,
            "display_name": display_name,
            "platform": platform,
            "policy_mode": policy_mode,
            "capabilities": capabilities or [],
            "execution_targets": execution_targets or ["local"],
            "instance_id": effective_instance_id,
            "capability_digest": self._capability_digest(capabilities),
            "note": "local_worker_boot",
        }
        try:
            result = self._request("POST", f"/runtime/runtimes/{runtime_id}/register", payload)
            self.runtime_session_token = str(result.get("session_token") or "").strip() or None
            self.runtime_instance_id = str(result.get("instance_id") or effective_instance_id).strip() or effective_instance_id
            self._registration = {
                "runtime_id": runtime_id,
                "runtime_type": runtime_type,
                "display_name": display_name,
                "platform": platform,
                "policy_mode": policy_mode,
                "capabilities": list(capabilities or []),
                "execution_targets": list(execution_targets or ["local"]),
                "instance_id": self.runtime_instance_id,
            }
            return result
        except ApiRequestError as exc:
            if exc.status_code not in {404, 405}:
                raise
            self.heartbeat_worker(runtime_id, None, "runtime_registered")
            return {"ok": True, "runtime_id": runtime_id, "legacy": True}

    def claim_run(self, worker_id: str) -> Dict[str, Any]:
        response = self._retry_with_reregister(
            worker_id,
            lambda: self._request_with_fallback(
                "POST",
                "/runtime/tasks/claim",
                "/local/runs/claim",
                {
                    "runtime_id": worker_id,
                    "session_token": self.runtime_session_token,
                    "instance_id": self.runtime_instance_id,
                    "execution_target": "local",
                },
            ),
        )
        task = response.get("task") if isinstance(response.get("task"), dict) else None
        if task is not None and "run" not in response:
            run = task.get("run") if isinstance(task.get("run"), dict) else None
            if isinstance(run, dict):
                response["run"] = run
        return response

    def heartbeat_run(self, run_id: str, worker_id: str, note: str):
        self._retry_with_reregister(
            worker_id,
            lambda: self._request_with_fallback(
                "POST",
                f"/runtime/tasks/{run_id}/heartbeat",
                f"/local/runs/{run_id}/heartbeat",
                {
                    "runtime_id": worker_id,
                    "session_token": self.runtime_session_token,
                    "instance_id": self.runtime_instance_id,
                    "note": note[:300],
                },
            ),
        )

    def complete_run(
        self,
        run_id: str,
        worker_id: str,
        result_text: str,
        result_data: Optional[Dict[str, Any]] = None,
        usage_masked: Optional[Dict[str, Any]] = None,
    ):
        def _payload() -> Dict[str, Any]:
            payload: Dict[str, Any] = {"worker_id": worker_id, "result_text": result_text}
            if isinstance(result_data, dict):
                payload["result_data"] = result_data
            if isinstance(usage_masked, dict):
                payload["usage_masked"] = usage_masked
            payload["runtime_id"] = worker_id
            payload["session_token"] = self.runtime_session_token
            payload["instance_id"] = self.runtime_instance_id
            return payload

        self._retry_with_reregister(
            worker_id,
            lambda: self._request_with_fallback(
                "POST",
                f"/runtime/tasks/{run_id}/complete",
                f"/local/runs/{run_id}/complete",
                _payload(),
            ),
        )

    def fail_run(self, run_id: str, worker_id: str, error_message: str):
        def _payload() -> Dict[str, Any]:
            return {
                "runtime_id": worker_id,
                "session_token": self.runtime_session_token,
                "instance_id": self.runtime_instance_id,
                "error": error_message[:1000],
            }

        self._retry_with_reregister(
            worker_id,
            lambda: self._request_with_fallback(
                "POST",
                f"/runtime/tasks/{run_id}/fail",
                f"/local/runs/{run_id}/fail",
                _payload(),
            ),
        )

    def heartbeat_worker(self, worker_id: str, current_run_id: Optional[str], note: str):
        def _payload() -> Dict[str, Any]:
            payload: Dict[str, Any] = {"note": note[:240]}
            if current_run_id:
                payload["current_run_id"] = current_run_id
            payload["session_token"] = self.runtime_session_token
            payload["instance_id"] = self.runtime_instance_id
            return payload

        self._retry_with_reregister(
            worker_id,
            lambda: self._request_with_fallback(
                "POST",
                f"/runtime/runtimes/{worker_id}/heartbeat",
                f"/local/workers/{worker_id}/heartbeat",
                _payload(),
            ),
        )
