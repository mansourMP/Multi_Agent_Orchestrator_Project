from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List

from common import business_state_for_time, load_config, load_current_state, resolve_space_config
from model_router import summarize_scene


def detect_people(image_path: Path, detector_config: Dict[str, Any]) -> Dict[str, Any]:
    model_id = str(detector_config.get("model_id") or "").strip()
    if not model_id:
        raise RuntimeError("detector.model_id is required.")
    threshold = float(detector_config.get("threshold") or 0.35)
    person_label = str(detector_config.get("person_label") or "person").strip().lower()
    try:
        import torch  # type: ignore
        from PIL import Image  # type: ignore
        from transformers import AutoImageProcessor, RTDetrV2ForObjectDetection  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "RT-DETRv2 detection requires torch, pillow, and transformers. Install the vision-monitor dependencies first."
        ) from exc

    image = Image.open(image_path).convert("RGB")
    processor = AutoImageProcessor.from_pretrained(model_id)
    model = RTDetrV2ForObjectDetection.from_pretrained(model_id)
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    target_sizes = torch.tensor([image.size[::-1]])
    processed = processor.post_process_object_detection(outputs, threshold=threshold, target_sizes=target_sizes)[0]
    boxes: List[Dict[str, Any]] = []
    count = 0
    for score, label, box in zip(processed["scores"], processed["labels"], processed["boxes"]):
        label_name = str(model.config.id2label.get(int(label), "")).strip().lower()
        if label_name != person_label:
            continue
        count += 1
        boxes.append(
            {
                "label": label_name,
                "score": round(float(score), 4),
                "bbox": [round(float(value), 2) for value in box.tolist()],
            }
        )
    return {
        "occupancy_count": count,
        "detections": boxes,
        "model_id": model_id,
        "threshold": threshold,
    }


def _extract_json_object(raw_text: str) -> Dict[str, Any]:
    text = str(raw_text or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        pass
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _summary_status(space: Dict[str, Any], count: int, business_state: str) -> str:
    if business_state == "closed":
        return "closed"
    busy_threshold = int(space.get("busy_threshold") or 15)
    if count <= 0:
        return "open_quiet"
    if count >= busy_threshold:
        return "open_busy"
    return "open_normal"


def _fallback_summary_lines(space_name: str, count: int, status: str, timestamp_label: str, anomaly: str | None = None) -> List[str]:
    traffic = "busy" if status == "open_busy" else "quiet" if status == "open_quiet" else "normal"
    return [
        f"{space_name} is {'closed' if status == 'closed' else 'open'}.",
        f"There are about {count} people in view.",
        f"Traffic level is {traffic}.",
        f"{anomaly or 'No anomaly detected.'}",
        f"Last updated at {timestamp_label}.",
    ]


def _normalize_summary_lines(raw_text: str, fallback_lines: List[str]) -> List[str]:
    lines = [line.strip(" -•\t") for line in str(raw_text or "").replace("\r", "\n").split("\n") if line.strip()]
    cleaned = [line.rstrip(".") + "." for line in lines[:5]]
    while len(cleaned) < 5:
        cleaned.append(fallback_lines[len(cleaned)])
    return cleaned[:5]


def _load_image_metrics(image_path: Path) -> Dict[str, Any]:
    metrics = {
        "fingerprint": hashlib.sha256(image_path.read_bytes()).hexdigest()[:16],
        "brightness": 0.0,
        "motion_score": 0.0,
    }
    try:
        from PIL import Image, ImageChops, ImageStat  # type: ignore
    except Exception:
        return metrics
    image = Image.open(image_path).convert("L")
    metrics["brightness"] = round(float(ImageStat.Stat(image).mean[0]), 3)
    return metrics


def _compare_to_previous(image_path: Path, previous_snapshot_path: str) -> float:
    if not previous_snapshot_path:
        return 1.0
    prev_path = Path(previous_snapshot_path).expanduser()
    if not prev_path.exists():
        return 1.0
    try:
        from PIL import Image, ImageChops, ImageStat  # type: ignore
    except Exception:
        return 1.0
    current = Image.open(image_path).convert("L").resize((128, 72))
    previous = Image.open(prev_path).convert("L").resize((128, 72))
    diff = ImageChops.difference(current, previous)
    score = float(ImageStat.Stat(diff).mean[0]) / 255.0
    return round(score, 4)


def _previous_summary_age_minutes(previous_state: Dict[str, Any], now: datetime) -> int:
    timestamp = str(previous_state.get("summary_refreshed_at") or previous_state.get("timestamp") or "").strip()
    if not timestamp:
        return 10**9
    try:
        parsed = datetime.fromisoformat(timestamp)
    except Exception:
        return 10**9
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=now.tzinfo)
    return max(0, round((now - parsed).total_seconds() / 60.0))


def _should_refresh_summary(
    config: Dict[str, Any],
    previous_state: Dict[str, Any],
    image_metrics: Dict[str, Any],
    motion_score: float,
) -> bool:
    if not previous_state:
        return True
    refresh_minutes = int(((config.get("monitoring") if isinstance(config.get("monitoring"), dict) else {}) or {}).get("summary_refresh_minutes") or 15)
    previous_fingerprint = str(previous_state.get("snapshot_fingerprint") or "").strip()
    previous_confidence = float(previous_state.get("confidence") or 0)
    age_minutes = _previous_summary_age_minutes(previous_state, datetime.now().astimezone())
    if age_minutes >= refresh_minutes:
        return True
    if previous_confidence < 0.5:
        return True
    if previous_fingerprint and previous_fingerprint != str(image_metrics.get("fingerprint") or "") and motion_score >= 0.08:
        return True
    return False


def _vlm_only_scene_state(
    image_path: Path,
    config: Dict[str, Any],
    space: Dict[str, Any],
    timestamp_label: str,
    business_state: str,
) -> Dict[str, Any]:
    vlm_cfg = config.get("vlm") if isinstance(config.get("vlm"), dict) else {}
    prompt = (
        f"You are analyzing a monitored physical space named '{space.get('space_name') or space.get('space_id')}'. "
        f"The space business state is '{business_state}'. "
        "Return only valid JSON with this shape: "
        '{"occupancy_count": <integer>, "status": "open_busy|open_normal|open_quiet|closed|unknown", '
        '"anomalies": [<string>], "summary_lines": [<exactly 5 short strings>]}. '
        "Estimate occupancy conservatively from the image. "
        "Do not include markdown fences or any extra text."
    )
    summary = summarize_scene(image_path, prompt, vlm_cfg)
    parsed = _extract_json_object(str(summary.get("text") or "").strip())
    occupancy = int(parsed.get("occupancy_count") or 0)
    status = str(parsed.get("status") or "").strip().lower()
    if status not in {"open_busy", "open_normal", "open_quiet", "closed", "unknown"}:
        status = _summary_status(space, occupancy, business_state)
    anomalies_raw = parsed.get("anomalies") if isinstance(parsed.get("anomalies"), list) else []
    anomalies = [str(item).strip() for item in anomalies_raw if str(item).strip()][:10]
    fallback_lines = _fallback_summary_lines(
        str(space.get("space_name") or space.get("space_id") or "Space"),
        occupancy,
        status,
        timestamp_label,
        anomaly=anomalies[0] if anomalies else None,
    )
    summary_lines_raw = parsed.get("summary_lines") if isinstance(parsed.get("summary_lines"), list) else []
    summary_text = "\n".join(str(item).strip() for item in summary_lines_raw if str(item).strip())
    summary_lines = _normalize_summary_lines(summary_text, fallback_lines)
    return {
        "occupancy_count": occupancy,
        "status": status,
        "anomalies": anomalies,
        "summary_lines": summary_lines,
        "summary_model": {
            "provider": str(summary.get("provider") or "unknown"),
            "model": str(summary.get("model") or "unknown"),
        },
    }


def analyze_snapshot(
    image_path: Path,
    config: Dict[str, Any],
    *,
    space_id: str | None = None,
    previous_state: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    space = resolve_space_config(
        config,
        space_id=space_id or str((config.get("monitoring") if isinstance(config.get("monitoring"), dict) else {}).get("default_space_id") or "").strip(),
    )
    previous = previous_state or load_current_state(config, str(space.get("space_id") or "").strip())
    detector_config = config.get("detector") if isinstance(config.get("detector"), dict) else {}
    timestamp = datetime.now().astimezone()
    timestamp_iso = timestamp.isoformat()
    timestamp_label = timestamp.strftime("%H:%M local time")
    business_state = business_state_for_time(space, timestamp)
    image_metrics = _load_image_metrics(image_path)
    motion_score = _compare_to_previous(image_path, str(previous.get("snapshot_path") or ""))
    refresh_summary = _should_refresh_summary(config, previous, image_metrics, motion_score)

    if previous and not refresh_summary:
        occupancy_count = int(previous.get("occupancy_count") or 0)
        status = str(previous.get("status") or _summary_status(space, occupancy_count, business_state)).strip() or "unknown"
        return {
            "schema_version": "1.0",
            "space_id": str(space.get("space_id") or "").strip(),
            "space_name": str(space.get("space_name") or space.get("space_id") or "Space").strip(),
            "camera_ids": ["cam-01"],
            "timestamp": timestamp_iso,
            "occupancy_count": occupancy_count,
            "status": status,
            "business_state": business_state,
            "confidence": float(previous.get("confidence") or 0.8),
            "anomalies": previous.get("anomalies") if isinstance(previous.get("anomalies"), list) else [],
            "summary_lines": previous.get("summary_lines") if isinstance(previous.get("summary_lines"), list) else [],
            "detections": previous.get("detections") if isinstance(previous.get("detections"), list) else [],
            "detector": previous.get("detector") if isinstance(previous.get("detector"), dict) else {"model_id": "", "threshold": detector_config.get("threshold")},
            "summary_model": previous.get("summary_model") if isinstance(previous.get("summary_model"), dict) else {"provider": "cached", "model": "reuse"},
            "snapshot_path": str(image_path),
            "snapshot_fingerprint": str(image_metrics.get("fingerprint") or ""),
            "summary_refreshed_at": str(previous.get("summary_refreshed_at") or previous.get("timestamp") or timestamp_iso),
            "heuristic": {
                "brightness": image_metrics.get("brightness"),
                "motion_score": motion_score,
                "reused_previous_summary": True,
            },
        }

    anomalies: List[str] = []
    detection: Dict[str, Any] = {"occupancy_count": 0, "detections": [], "model_id": "", "threshold": detector_config.get("threshold")}
    count = 0
    status = "unknown"
    summary_lines: List[str] = []
    summary_source = {"provider": "deterministic", "model": "fallback"}

    detector_enabled = bool(detector_config.get("enabled"))
    if detector_enabled:
        try:
            detection = detect_people(image_path, detector_config)
            count = int(detection.get("occupancy_count") or 0)
            status = _summary_status(space, count, business_state)
            prompt = (
                f"You are summarizing a monitored physical space named '{space.get('space_name') or space.get('space_id')}'. "
                f"Structured detector result: occupancy_count={count}, status={status}, detections={json.dumps(detection.get('detections') or [])}. "
                "Write exactly 5 short lines, one sentence per line, grounded in the structured result. "
                "Do not invent counts. Mention anomalies only if they are explicit."
            )
            fallback_lines = _fallback_summary_lines(str(space.get("space_name") or space.get("space_id") or "Space"), count, status, timestamp_label)
            summary = summarize_scene(image_path, prompt, config.get("vlm") if isinstance(config.get("vlm"), dict) else {})
            summary_lines = _normalize_summary_lines(str(summary.get("text") or "").strip(), fallback_lines)
            summary_source = {"provider": str(summary.get("provider") or "unknown"), "model": str(summary.get("model") or "unknown")}
        except Exception as exc:
            anomalies.append(f"detector_or_summary_error: {str(exc)}")
            detector_enabled = False

    if not detector_enabled:
        vlm_state = _vlm_only_scene_state(image_path, config, space, timestamp_label, business_state)
        count = int(vlm_state.get("occupancy_count") or 0)
        status = str(vlm_state.get("status") or "unknown").strip() or "unknown"
        anomalies.extend(str(item).strip() for item in (vlm_state.get("anomalies") if isinstance(vlm_state.get("anomalies"), list) else []) if str(item).strip())
        summary_lines = [str(item).strip() for item in (vlm_state.get("summary_lines") if isinstance(vlm_state.get("summary_lines"), list) else []) if str(item).strip()][:5]
        summary_source = vlm_state.get("summary_model") if isinstance(vlm_state.get("summary_model"), dict) else summary_source

    confidence = 0.9 if not anomalies else 0.65
    if business_state == "closed" and count > 0:
        anomalies.append("Movement detected outside business hours.")

    return {
        "schema_version": "1.0",
        "space_id": str(space.get("space_id") or "").strip(),
        "space_name": str(space.get("space_name") or space.get("space_id") or "Space").strip(),
        "camera_ids": ["cam-01"],
        "timestamp": timestamp_iso,
        "occupancy_count": count,
        "status": status,
        "business_state": business_state,
        "confidence": confidence,
        "anomalies": anomalies,
        "summary_lines": summary_lines,
        "detections": detection.get("detections") or [],
        "detector": {"model_id": str(detection.get("model_id") or "").strip(), "threshold": detection.get("threshold")},
        "summary_model": summary_source,
        "snapshot_path": str(image_path),
        "snapshot_fingerprint": str(image_metrics.get("fingerprint") or ""),
        "summary_refreshed_at": timestamp_iso,
        "heuristic": {
            "brightness": image_metrics.get("brightness"),
            "motion_score": motion_score,
            "reused_previous_summary": False,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze one snapshot for the vision-monitor skill.")
    parser.add_argument("image_path")
    parser.add_argument("--config", default=None)
    parser.add_argument("--space-id", default=None)
    args = parser.parse_args()

    config = load_config(Path(str(args.config)).expanduser().resolve() if args.config else None)
    result = analyze_snapshot(Path(args.image_path).expanduser().resolve(), config, space_id=args.space_id)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
