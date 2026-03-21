from __future__ import annotations

import re
from typing import Dict, List

AutomationIntent = str

INTENT_KEYWORDS: Dict[str, List[str]] = {
    "CAMERA_MONITOR": ["monitor", "watch", "camera", "entrance", "shop", "pool", "parking"],
    "EMAIL_SUMMARY": ["summarize", "emails", "inbox", "daily summary"],
    "LEAD_FOLLOWUP": ["follow up", "leads", "contacts", "outreach"],
    "ALERT_ME": ["alert", "notify", "tell me when", "let me know"],
}


def classify_automation_intent(text: str) -> AutomationIntent:
    normalized = f" {str(text or '').strip().lower()} "
    for intent, keywords in INTENT_KEYWORDS.items():
        if any((f" {keyword} " in normalized) or (keyword in normalized) for keyword in keywords):
            return intent
    return "UNKNOWN"


def looks_like_camera_source(text: str) -> bool:
    value = str(text or "").strip()
    if not value:
        return False
    if re.match(r"^data:image/[a-z0-9.+-]+;base64,", value, flags=re.IGNORECASE):
        return True
    return bool(re.match(r"^(https?|rtsp|rtmps?|rtmp)://", value, flags=re.IGNORECASE))
