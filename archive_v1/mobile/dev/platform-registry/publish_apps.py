from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent
APPS_DIR = BASE_DIR / "apps"


def load_manifests() -> list[dict]:
    manifests: list[dict] = []
    for path in sorted(APPS_DIR.glob("*.json")):
        manifests.append(json.loads(path.read_text()))
    return manifests


def publish_manifest(base_url: str, api_key: str, manifest: dict) -> None:
    body = json.dumps(manifest).encode("utf-8")
    request = Request(
        f"{base_url.rstrip('/')}/apps/publish",
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-API-Key": api_key,
        },
        method="POST",
    )
    with urlopen(request) as response:
        payload = json.loads(response.read().decode("utf-8"))
    item = payload.get("item", {})
    print(f"published {item.get('id')} {item.get('version')}")


def main() -> int:
    base_url = os.getenv("EMPYRALIS_PLATFORM_REGISTRY_URL", "http://127.0.0.1:8011").strip()
    api_key = os.getenv("EMPYRALIS_PLATFORM_REGISTRY_KEY", "").strip()
    if not api_key:
        print("EMPYRALIS_PLATFORM_REGISTRY_KEY is required", file=sys.stderr)
        return 1

    manifests = load_manifests()
    if not manifests:
        print("No app manifests found.", file=sys.stderr)
        return 1

    try:
        for manifest in manifests:
            publish_manifest(base_url, api_key, manifest)
    except HTTPError as error:
        print(f"publish failed: HTTP {error.code}", file=sys.stderr)
        return 1
    except URLError as error:
        print(f"publish failed: {error.reason}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
