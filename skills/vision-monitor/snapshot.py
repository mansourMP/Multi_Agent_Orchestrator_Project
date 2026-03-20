from __future__ import annotations

import argparse
import shutil
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Tuple

from common import load_config, resolve_camera_source, resolve_space_config, snapshots_root


def resolve_camera(config: Dict[str, Any], *, space_id: str | None = None, camera_id: str | None = None) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    selected_space = resolve_space_config(config, space_id=space_id)
    _, selected_camera = resolve_camera_source(selected_space)
    if camera_id:
        selected_camera["id"] = str(camera_id).strip()
    return selected_space, selected_camera


def capture_snapshot(camera: Dict[str, Any], output_path: Path) -> Path:
    input_cfg = camera.get("input") if isinstance(camera.get("input"), dict) else {}
    input_type = str(input_cfg.get("type") or "webcam").strip().lower()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if input_type == "webcam":
        try:
            import cv2  # type: ignore
        except Exception as exc:
            raise RuntimeError("OpenCV is required for webcam capture. Install opencv-python.") from exc
        device_index = int(input_cfg.get("device_index") or 0)
        cap = cv2.VideoCapture(device_index)
        if not cap.isOpened():
            raise RuntimeError(f"Unable to open webcam device {device_index}.")
        ok, frame = cap.read()
        cap.release()
        if not ok or frame is None:
            raise RuntimeError("Webcam opened but no frame was captured.")
        if not cv2.imwrite(str(output_path), frame):
            raise RuntimeError(f"Failed to write snapshot to {output_path}.")
        return output_path

    if input_type == "rtsp":
        stream_url = str(input_cfg.get("url") or "").strip()
        if not stream_url:
            raise RuntimeError("RTSP camera input requires input.url.")
        try:
            import av  # type: ignore
        except Exception as exc:
            raise RuntimeError("PyAV is required for RTSP capture. Install av.") from exc
        try:
            container = av.open(stream_url, timeout=5)
            for frame in container.decode(video=0):
                image = frame.to_image()
                image.save(output_path)
                container.close()
                return output_path
            container.close()
        except Exception as exc:
            raise RuntimeError(f"RTSP snapshot capture failed: {exc}") from exc
        raise RuntimeError("RTSP stream opened but no video frame was decoded.")

    if input_type == "snapshot_url":
        snapshot_url = str(input_cfg.get("url") or "").strip()
        if not snapshot_url:
            raise RuntimeError("HTTP snapshot input requires input.url.")
        try:
            with urllib.request.urlopen(snapshot_url, timeout=10) as response:
                output_path.write_bytes(response.read())
        except Exception as exc:
            raise RuntimeError(f"HTTP snapshot fetch failed: {exc}") from exc
        return output_path

    if input_type == "file":
        source_path = Path(str(input_cfg.get("path") or "").strip()).expanduser()
        if not source_path.exists():
            raise RuntimeError(f"Configured file snapshot source does not exist: {source_path}")
        shutil.copyfile(source_path, output_path)
        return output_path

    raise RuntimeError(f"Unsupported camera input type: {input_type}")


def default_output_path(config: Dict[str, Any], space_id: str, camera_id: str) -> Path:
    timestamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    return snapshots_root(config) / space_id / f"{camera_id}-{timestamp}.jpg"


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture one snapshot for the vision-monitor skill.")
    parser.add_argument("--config", default=str(SKILL_DIR / "config.yaml"))
    parser.add_argument("--space-id", default=None)
    parser.add_argument("--camera-id", default=None)
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    config_path = Path(str(args.config)).expanduser().resolve()
    config = load_config(config_path)
    space, camera = resolve_camera(config, space_id=args.space_id, camera_id=args.camera_id)
    output_path = Path(str(args.output)).expanduser().resolve() if args.output else default_output_path(
        config,
        str(space.get("id") or "space"),
        str(camera.get("id") or "camera"),
    )
    saved = capture_snapshot(camera, output_path)
    print(str(saved))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
