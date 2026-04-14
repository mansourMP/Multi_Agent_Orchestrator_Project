from __future__ import annotations

import threading
import time
from typing import Dict, Optional


def evaluate_request_window(
    *,
    buckets: Dict[str, list[float]],
    lock: threading.Lock,
    key: str,
    limit: int,
    now: Optional[float] = None,
) -> Dict[str, int | bool]:
    current = float(now if now is not None else time.time())
    normalized_limit = max(int(limit or 0), 1)
    with lock:
        bucket = list(buckets.get(key, []))
        cutoff = current - 60.0
        bucket = [item for item in bucket if item >= cutoff]
        if len(bucket) >= normalized_limit:
            retry_after = max(1, int(round(bucket[0] + 60.0 - current)))
            buckets[key] = bucket
            return {
                "allowed": False,
                "retry_after_seconds": retry_after,
                "limit": normalized_limit,
                "observed": len(bucket),
            }
        bucket.append(current)
        buckets[key] = bucket
    return {
        "allowed": True,
        "retry_after_seconds": 0,
        "limit": normalized_limit,
        "observed": len(bucket),
    }
