from __future__ import annotations

import argparse
import json
import os
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List

from analyze import analyze_snapshot
from common import (
    alerts_path,
    business_state_for_time,
    current_state_path,
    history_path,
    load_config,
    load_current_state,
    load_space_configs,
    resolve_space_config,
    snapshots_root,
    spaces_root,
    write_space_config,
)
from snapshot import capture_snapshot, default_output_path, resolve_camera
from state_writer import write_space_state


SKILL_DIR = Path(__file__).resolve().parent


def _read_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    items: List[Dict[str, Any]] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
            if isinstance(parsed, dict):
                items.append(parsed)
        except Exception:
            continue
    return items


def _append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def _history_row(state: Dict[str, Any]) -> Dict[str, Any]:
    status = str(state.get("status") or "unknown").strip().lower()
    simplified = "unknown"
    if status == "closed":
        simplified = "closed"
    elif status == "open_busy":
        simplified = "busy"
    elif status == "open_normal":
        simplified = "normal"
    elif status == "open_quiet":
        simplified = "quiet"
    return {
        "ts": str(state.get("timestamp") or "").strip(),
        "space_id": str(state.get("space_id") or "").strip(),
        "occupancy_count": int(state.get("occupancy_count") or 0),
        "status": simplified,
        "business_state": str(state.get("business_state") or "unknown").strip(),
        "anomaly": bool(state.get("anomalies")),
        "confidence": float(state.get("confidence") or 0),
    }


def _recent_unknown_count(config: Dict[str, Any], space_id: str, current_confidence: float) -> int:
    rows = _read_jsonl(history_path(spaces_root(config), space_id))
    consecutive = 0
    for item in reversed(rows[-2:]):
        if float(item.get("confidence") or 0) < 0.5:
            consecutive += 1
        else:
            break
    if current_confidence < 0.5:
        consecutive += 1
    return consecutive


def _alert_recently_sent(alerts: Iterable[Dict[str, Any]], code: str, *, window_minutes: int = 30) -> bool:
    cutoff = datetime.now().astimezone() - timedelta(minutes=window_minutes)
    for item in alerts:
        if str(item.get("code") or "").strip() != code:
            continue
        try:
            parsed = datetime.fromisoformat(str(item.get("ts") or "").strip())
        except Exception:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.now().astimezone().tzinfo)
        if parsed >= cutoff:
            return True
    return False


def _send_telegram_alert(recipients: List[str], text: str) -> None:
    bot_token = str(os.getenv("ORION_TELEGRAM_BOT_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN") or "").strip()
    if not bot_token or not recipients:
        return
    endpoint = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    for chat_id in recipients:
        payload = urllib.parse.urlencode({"chat_id": chat_id, "text": text, "disable_web_page_preview": "true"}).encode("utf-8")
        req = urllib.request.Request(endpoint, data=payload, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        try:
            with urllib.request.urlopen(req, timeout=15):
                pass
        except Exception:
            continue


def _send_wechat_work_alert(webhook_url: str, text: str) -> None:
    endpoint = str(webhook_url or "").strip()
    if not endpoint:
        return
    payload = json.dumps(
        {
            "msgtype": "text",
            "text": {
                "content": text,
            },
        },
        ensure_ascii=False,
    ).encode("utf-8")
    req = urllib.request.Request(endpoint, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15):
            pass
    except Exception:
        return


def _wechat_alert_message(space_config: Dict[str, Any], alert: Dict[str, Any]) -> str:
    space_name = str(space_config.get("space_name") or space_config.get("space_id") or "Space").strip()
    message = str(alert.get("message") or "").strip() or "Alert raised."
    timestamp = str(alert.get("ts") or "").strip() or datetime.now().astimezone().isoformat()
    return f"⚠️ {space_name}: {message}\nTime: {timestamp}\n— Empyralist"


def _evaluate_alerts(config: Dict[str, Any], space_config: Dict[str, Any], state: Dict[str, Any]) -> List[Dict[str, Any]]:
    root = spaces_root(config)
    space_id = str(space_config.get("space_id") or "").strip()
    existing_alerts = _read_jsonl(alerts_path(root, space_id))
    created: List[Dict[str, Any]] = []
    now_iso = str(state.get("timestamp") or datetime.now().astimezone().isoformat())
    occupancy = int(state.get("occupancy_count") or 0)
    busy_threshold = int(space_config.get("busy_threshold") or 15)
    business_state = str(state.get("business_state") or business_state_for_time(space_config, datetime.now().astimezone())).strip()
    heuristic = state.get("heuristic") if isinstance(state.get("heuristic"), dict) else {}
    motion_score = float(heuristic.get("motion_score") or 0)
    confidence = float(state.get("confidence") or 0)

    def add_alert(code: str, severity: str, message: str) -> None:
        nonlocal existing_alerts
        if _alert_recently_sent(existing_alerts, code):
            return
        payload = {
            "id": str(uuid.uuid4()),
            "ts": now_iso,
            "space_id": space_id,
            "severity": severity,
            "code": code,
            "message": message,
            "resolved": False,
        }
        _append_jsonl(alerts_path(root, space_id), payload)
        existing_alerts.append(payload)
        created.append(payload)

    if occupancy > busy_threshold:
        add_alert(
            "high_occupancy",
            "warning",
            f"{space_config.get('space_name') or space_id} occupancy is {occupancy}, above threshold {busy_threshold}.",
        )
    if business_state == "closed" and (occupancy > 0 or motion_score >= 0.08):
        add_alert(
            "after_hours_activity",
            "critical",
            f"{space_config.get('space_name') or space_id} shows activity outside business hours.",
        )
    if _recent_unknown_count(config, space_id, confidence) >= 3:
        add_alert(
            "low_confidence_state",
            "info",
            f"{space_config.get('space_name') or space_id} has stayed low confidence for 3 scans.",
        )
    if created:
        text = "\n".join([f"{alert['severity'].upper()} · {alert['message']}" for alert in created])
        _send_telegram_alert(
            [str(value).strip() for value in (space_config.get("telegram_recipients") if isinstance(space_config.get("telegram_recipients"), list) else []) if str(value).strip()],
            text,
        )
        alert_channels = config.get("alert_channels") if isinstance(config.get("alert_channels"), dict) else {}
        wechat_webhook_url = str(alert_channels.get("wechat_webhook_url") or "").strip()
        if wechat_webhook_url:
            for alert in created:
                _send_wechat_work_alert(wechat_webhook_url, _wechat_alert_message(space_config, alert))
    return created


def _scan_space(config: Dict[str, Any], space_config: Dict[str, Any], *, camera_id: str | None = None) -> Path:
    space_id = str(space_config.get("space_id") or "").strip()
    if not space_id:
        raise RuntimeError("space_id is required.")
    write_space_config(spaces_root(config), space_config)
    previous_state = load_current_state(config, space_id)
    _, camera = resolve_camera(config, space_id=space_id, camera_id=camera_id)
    snapshot_path = default_output_path(config, space_id, str(camera.get("id") or "cam-01"))
    capture_snapshot(camera, snapshot_path)
    state = analyze_snapshot(snapshot_path, config, space_id=space_id, previous_state=previous_state)
    state["camera_ids"] = [str(camera.get("id") or "cam-01").strip()]
    history_item = _history_row(state)
    current_path = write_space_state(spaces_root(config), state, history_item=history_item)
    _evaluate_alerts(config, space_config, state)
    return current_path


def run_once(config: Dict[str, Any], *, space_id: str | None = None, camera_id: str | None = None) -> List[Path]:
    spaces = load_space_configs(config)
    if not spaces:
        raise RuntimeError("No monitored spaces are configured.")
    targets = [resolve_space_config(config, space_id=space_id)] if space_id else spaces
    written: List[Path] = []
    for space_config in targets:
        written.append(_scan_space(config, space_config, camera_id=camera_id))
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the vision-monitor worker once or in a loop.")
    parser.add_argument("--config", default=str(SKILL_DIR / "config.yaml"))
    parser.add_argument("--space-id", default=None)
    parser.add_argument("--camera-id", default=None)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    config = load_config(Path(str(args.config)).expanduser().resolve())
    if not bool(config.get("enabled")):
        raise SystemExit("vision-monitor is disabled in config.yaml")

    monitoring = config.get("monitoring") if isinstance(config.get("monitoring"), dict) else {}
    interval = int(monitoring.get("interval_seconds") or 300)
    if args.once:
        for path in run_once(config, space_id=args.space_id, camera_id=args.camera_id):
            print(str(path))
        return 0

    while True:
        for path in run_once(config, space_id=args.space_id, camera_id=args.camera_id):
            print(str(path))
        time.sleep(max(5, interval))


if __name__ == "__main__":
    raise SystemExit(main())
