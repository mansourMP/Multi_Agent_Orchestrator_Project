from __future__ import annotations

import json
import math
from datetime import datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent.parent.parent
TEMPLATE_ROOT = ROOT.parent / "spaces_template"
DEMO_SPACES_ROOT = ROOT / "spaces"
ASSET_ROOT = ROOT / "assets"
POOL_SOURCE = PROJECT_ROOT / "Screenshot 2026-03-20 at 21.14.39.png"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def write_svg(path: Path, title: str, subtitle: str, accent: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#121212"/>
      <stop offset="100%" stop-color="#1f1f1f"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect x="80" y="80" width="1120" height="560" rx="32" fill="#0f172a" stroke="{accent}" stroke-width="4"/>
  <circle cx="220" cy="220" r="72" fill="{accent}" opacity="0.32"/>
  <circle cx="1060" cy="520" r="92" fill="{accent}" opacity="0.22"/>
  <text x="140" y="300" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="64" font-weight="700">{title}</text>
  <text x="140" y="360" fill="#d4d4d8" font-family="Inter, Arial, sans-serif" font-size="30">{subtitle}</text>
  <text x="140" y="470" fill="#a1a1aa" font-family="Inter, Arial, sans-serif" font-size="24">Demo snapshot for hotel operations dashboard</text>
</svg>
""",
        encoding="utf-8",
    )


def build_history(space_id: str, base_occupancy: int, amplitude: int, business_open_hour: int, business_close_hour: int, *, now: datetime) -> list[dict]:
    aligned_now = now.replace(minute=0, second=0, microsecond=0)
    rows: list[dict] = []
    for offset in range(23, -1, -1):
        point = aligned_now - timedelta(hours=offset)
        hour = point.hour
        in_hours = business_open_hour <= hour <= business_close_hour
        wave = math.sin((hour / 24.0) * math.pi * 2.0)
        occupancy = max(0, round(base_occupancy + amplitude * wave))
        if not in_hours:
            occupancy = min(occupancy, 2 if space_id == "lobby" else 0)
        status = "busy" if occupancy >= base_occupancy + max(2, amplitude // 2) else "normal" if occupancy > 0 else "quiet"
        rows.append(
            {
                "ts": point.isoformat(),
                "space_id": space_id,
                "occupancy_count": occupancy,
                "status": "closed" if not in_hours and occupancy == 0 else status,
                "business_state": "open" if in_hours else "closed",
                "anomaly": False,
                "confidence": 0.92,
            }
        )
    return rows


def seed_space(space_id: str, snapshot_path: Path, occupancy_count: int, status: str, summary_lines: list[str], history_rows: list[dict], alerts_rows: list[dict], *, now: datetime) -> None:
    config = json.loads((TEMPLATE_ROOT / space_id / "config.json").read_text(encoding="utf-8"))
    space_root = DEMO_SPACES_ROOT / space_id
    write_json(space_root / "config.json", config)
    write_json(
        space_root / "current_state.json",
        {
          "schema_version": "1.0",
          "space_id": space_id,
          "space_name": config["space_name"],
          "camera_ids": ["cam-01"],
          "timestamp": now.isoformat(),
          "occupancy_count": occupancy_count,
          "status": status,
          "business_state": "open" if status != "closed" else "closed",
          "confidence": 0.91,
          "anomalies": [],
          "summary_lines": summary_lines,
          "snapshot_path": str(snapshot_path.resolve()),
          "summary_model": {"provider": "demo", "model": "seed"},
          "detector": {"model_id": "", "threshold": 0.35},
          "detections": []
        },
    )
    write_jsonl(space_root / "history.jsonl", history_rows)
    write_jsonl(space_root / "alerts.jsonl", alerts_rows)


def main() -> int:
    now = datetime.now().astimezone().replace(second=0, microsecond=0)
    write_svg(ASSET_ROOT / "lobby.svg", "Lobby", "Guests moving through the entrance area", "#22c55e")
    write_svg(ASSET_ROOT / "breakfast.svg", "Breakfast Room", "Morning service with tables and guest traffic", "#f59e0b")
    if not POOL_SOURCE.exists():
        write_svg(ASSET_ROOT / "pool.svg", "Pool", "Pool deck and lounge seating", "#3b82f6")
        pool_snapshot = ASSET_ROOT / "pool.svg"
    else:
        pool_snapshot = POOL_SOURCE

    lobby_history = build_history("lobby", base_occupancy=6, amplitude=4, business_open_hour=0, business_close_hour=23, now=now)
    breakfast_history = build_history("breakfast", base_occupancy=12, amplitude=10, business_open_hour=6, business_close_hour=10, now=now)
    pool_history = build_history("pool", base_occupancy=8, amplitude=12, business_open_hour=7, business_close_hour=22, now=now)

    seed_space(
        "lobby",
        ASSET_ROOT / "lobby.svg",
        5,
        "open_normal",
        [
            "Lobby is open and calm.",
            "About 5 guests are visible near the entrance.",
            "Front desk traffic looks normal.",
            "No anomalies detected.",
            "Last updated just now."
        ],
        lobby_history,
        [],
        now=now,
    )
    seed_space(
        "breakfast",
        ASSET_ROOT / "breakfast.svg",
        16,
        "open_busy",
        [
            "Breakfast room is open and busy.",
            "Around 16 guests are seated or moving through service.",
            "Traffic is above the normal breakfast baseline.",
            "No anomaly detected.",
            "Last updated just now."
        ],
        breakfast_history,
        [
            {
                "id": "demo-breakfast-high",
                "ts": now.isoformat(),
                "space_id": "breakfast",
                "severity": "warning",
                "code": "high_occupancy",
                "message": "Breakfast room occupancy is above the configured busy threshold.",
                "resolved": False
            }
        ],
        now=now,
    )
    seed_space(
        "pool",
        pool_snapshot,
        25,
        "open_busy",
        [
            "Pool is open and busy.",
            "Roughly 25 guests are visible in and around the pool.",
            "Traffic is above the usual pool baseline.",
            "No anomaly detected.",
            "Last updated just now."
        ],
        pool_history,
        [
            {
                "id": "demo-pool-after-hours",
                "ts": (now - timedelta(minutes=18)).isoformat(),
                "space_id": "pool",
                "severity": "critical",
                "code": "after_hours_activity",
                "message": "Pool activity was detected outside configured business hours.",
                "resolved": False
            }
        ],
        now=now,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
