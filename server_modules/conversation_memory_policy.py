from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from server_modules import config_defaults_service


DIRECT_CHAT_PROFILE = "direct_chat"
EXTERNAL_CHANNEL_CUSTOMER_PROFILE = "external_channel_customer"
DURABLE_RUN_PROFILE = "durable_run"
SPECIALIST_PRIVATE_PROFILE = "specialist_private"
OWNER_SAGE_VIEW_PROFILE = "owner_sage_view"

CONTEXT_BUDGET_PRESET_COMPACT = "compact"
CONTEXT_BUDGET_PRESET_BALANCED = "balanced"
CONTEXT_BUDGET_PRESET_DEEP = "deep"

RETENTION_PRESET_SHORT = "short"
RETENTION_PRESET_STANDARD = "standard"
RETENTION_PRESET_EXTENDED = "extended"


@dataclass(frozen=True, slots=True)
class MemoryRetentionContract:
    raw_transcript_days: int
    summary_days: int
    semantic_days: int
    event_memory_days: int
    local_private_sync: str = "explicit_only"
    cloud_safe_only: bool = False


@dataclass(frozen=True, slots=True)
class MemoryPolicyProfile:
    name: str
    max_prompt_tokens: int
    preserve_last_messages: int
    summary_trigger_messages: int
    summary_trigger_tokens: int
    semantic_retrieval_k: int
    max_summary_chars: int
    max_business_plan_chars: int
    max_recent_log_days: int
    max_transcript_items: int
    raw_transcript_enabled: bool
    semantic_write_enabled: bool
    semantic_read_enabled: bool
    retention: MemoryRetentionContract


_BASE_RETENTION = MemoryRetentionContract(
    raw_transcript_days=365,
    summary_days=365,
    semantic_days=365,
    event_memory_days=365,
)

_CONTEXT_BUDGET_PRESETS = {
    CONTEXT_BUDGET_PRESET_COMPACT: {
        "max_prompt_tokens": 900,
        "preserve_last_messages": 6,
    },
    CONTEXT_BUDGET_PRESET_BALANCED: {
        "max_prompt_tokens": 1100,
        "preserve_last_messages": 8,
    },
    CONTEXT_BUDGET_PRESET_DEEP: {
        "max_prompt_tokens": 2200,
        "preserve_last_messages": 12,
    },
}

_RETENTION_PRESET_DAYS = {
    RETENTION_PRESET_SHORT: 30,
    RETENTION_PRESET_STANDARD: 365,
    RETENTION_PRESET_EXTENDED: 730,
}

_PROFILE_REGISTRY: Dict[str, MemoryPolicyProfile] = {
    DIRECT_CHAT_PROFILE: MemoryPolicyProfile(
        name=DIRECT_CHAT_PROFILE,
        max_prompt_tokens=8000,
        preserve_last_messages=10,
        summary_trigger_messages=12,
        summary_trigger_tokens=1500,
        semantic_retrieval_k=5,
        max_summary_chars=2200,
        max_business_plan_chars=3200,
        max_recent_log_days=7,
        max_transcript_items=12,
        raw_transcript_enabled=True,
        semantic_write_enabled=True,
        semantic_read_enabled=True,
        retention=_BASE_RETENTION,
    ),
    EXTERNAL_CHANNEL_CUSTOMER_PROFILE: MemoryPolicyProfile(
        name=EXTERNAL_CHANNEL_CUSTOMER_PROFILE,
        max_prompt_tokens=1100,
        preserve_last_messages=8,
        summary_trigger_messages=12,
        summary_trigger_tokens=1500,
        semantic_retrieval_k=5,
        max_summary_chars=2200,
        max_business_plan_chars=3200,
        max_recent_log_days=7,
        max_transcript_items=12,
        raw_transcript_enabled=True,
        semantic_write_enabled=False,
        semantic_read_enabled=False,
        retention=_BASE_RETENTION,
    ),
    DURABLE_RUN_PROFILE: MemoryPolicyProfile(
        name=DURABLE_RUN_PROFILE,
        max_prompt_tokens=2400,
        preserve_last_messages=8,
        summary_trigger_messages=12,
        summary_trigger_tokens=1500,
        semantic_retrieval_k=5,
        max_summary_chars=2200,
        max_business_plan_chars=2200,
        max_recent_log_days=7,
        max_transcript_items=8,
        raw_transcript_enabled=False,
        semantic_write_enabled=True,
        semantic_read_enabled=True,
        retention=_BASE_RETENTION,
    ),
    SPECIALIST_PRIVATE_PROFILE: MemoryPolicyProfile(
        name=SPECIALIST_PRIVATE_PROFILE,
        max_prompt_tokens=2400,
        preserve_last_messages=8,
        summary_trigger_messages=12,
        summary_trigger_tokens=1500,
        semantic_retrieval_k=5,
        max_summary_chars=2200,
        max_business_plan_chars=2200,
        max_recent_log_days=7,
        max_transcript_items=8,
        raw_transcript_enabled=True,
        semantic_write_enabled=True,
        semantic_read_enabled=True,
        retention=_BASE_RETENTION,
    ),
    OWNER_SAGE_VIEW_PROFILE: MemoryPolicyProfile(
        name=OWNER_SAGE_VIEW_PROFILE,
        max_prompt_tokens=2400,
        preserve_last_messages=8,
        summary_trigger_messages=12,
        summary_trigger_tokens=1500,
        semantic_retrieval_k=5,
        max_summary_chars=2200,
        max_business_plan_chars=2200,
        max_recent_log_days=7,
        max_transcript_items=4,
        raw_transcript_enabled=False,
        semantic_write_enabled=False,
        semantic_read_enabled=True,
        retention=_BASE_RETENTION,
    ),
}


def get_memory_policy_profile(profile: str | MemoryPolicyProfile) -> MemoryPolicyProfile:
    if isinstance(profile, MemoryPolicyProfile):
        if profile.name == DURABLE_RUN_PROFILE:
            return _resolve_durable_run_profile()
        return profile
    normalized_profile = str(profile or DIRECT_CHAT_PROFILE).strip().lower() or DIRECT_CHAT_PROFILE
    if normalized_profile == DURABLE_RUN_PROFILE:
        return _resolve_durable_run_profile()
    return _PROFILE_REGISTRY.get(normalized_profile, _PROFILE_REGISTRY[DIRECT_CHAT_PROFILE])


def normalize_context_budget_preset(value: str | None) -> str:
    token = str(value or "").strip().lower()
    if token in _CONTEXT_BUDGET_PRESETS:
        return token
    return config_defaults_service.default_context_budget_preset()


def normalize_retention_preset(value: str | None) -> str:
    token = str(value or "").strip().lower()
    if token in _RETENTION_PRESET_DAYS:
        return token
    return config_defaults_service.default_retention_preset()


def build_external_channel_memory_profile(
    *,
    context_budget_preset: str | None = None,
    retention_preset: str | None = None,
) -> MemoryPolicyProfile:
    base = _PROFILE_REGISTRY[EXTERNAL_CHANNEL_CUSTOMER_PROFILE]
    resolved_budget_preset = normalize_context_budget_preset(context_budget_preset)
    resolved_retention_preset = normalize_retention_preset(retention_preset)
    budget = _CONTEXT_BUDGET_PRESETS[resolved_budget_preset]
    retention_days = _RETENTION_PRESET_DAYS[resolved_retention_preset]
    return MemoryPolicyProfile(
        name=EXTERNAL_CHANNEL_CUSTOMER_PROFILE,
        max_prompt_tokens=budget["max_prompt_tokens"],
        preserve_last_messages=budget["preserve_last_messages"],
        summary_trigger_messages=base.summary_trigger_messages,
        summary_trigger_tokens=base.summary_trigger_tokens,
        semantic_retrieval_k=base.semantic_retrieval_k,
        max_summary_chars=base.max_summary_chars,
        max_business_plan_chars=base.max_business_plan_chars,
        max_recent_log_days=base.max_recent_log_days,
        max_transcript_items=base.max_transcript_items,
        raw_transcript_enabled=base.raw_transcript_enabled,
        semantic_write_enabled=base.semantic_write_enabled,
        semantic_read_enabled=base.semantic_read_enabled,
        retention=MemoryRetentionContract(
            raw_transcript_days=retention_days,
            summary_days=retention_days,
            semantic_days=retention_days,
            event_memory_days=retention_days,
            local_private_sync=base.retention.local_private_sync,
            cloud_safe_only=base.retention.cloud_safe_only,
        ),
    )


def _resolve_durable_run_profile() -> MemoryPolicyProfile:
    try:
        from server_modules import memory_service

        read_k = max(1, min(int(memory_service.runtime_memory.ORION_MEMORY_READ_K), 20))
        retention_days = max(1, min(int(memory_service.runtime_memory.ORION_MEMORY_RETENTION_DAYS_DEFAULT), 3650))
        max_text_chars = max(400, min(int(memory_service.runtime_memory.ORION_MEMORY_MAX_TEXT_CHARS), 12000))
    except Exception:
        read_k = _PROFILE_REGISTRY[DURABLE_RUN_PROFILE].semantic_retrieval_k
        retention_days = _PROFILE_REGISTRY[DURABLE_RUN_PROFILE].retention.semantic_days
        max_text_chars = 2400

    return MemoryPolicyProfile(
        name=DURABLE_RUN_PROFILE,
        max_prompt_tokens=max_text_chars,
        preserve_last_messages=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].preserve_last_messages,
        summary_trigger_messages=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].summary_trigger_messages,
        summary_trigger_tokens=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].summary_trigger_tokens,
        semantic_retrieval_k=read_k,
        max_summary_chars=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].max_summary_chars,
        max_business_plan_chars=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].max_business_plan_chars,
        max_recent_log_days=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].max_recent_log_days,
        max_transcript_items=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].max_transcript_items,
        raw_transcript_enabled=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].raw_transcript_enabled,
        semantic_write_enabled=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].semantic_write_enabled,
        semantic_read_enabled=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].semantic_read_enabled,
        retention=MemoryRetentionContract(
            raw_transcript_days=retention_days,
            summary_days=retention_days,
            semantic_days=retention_days,
            event_memory_days=retention_days,
            local_private_sync=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].retention.local_private_sync,
            cloud_safe_only=_PROFILE_REGISTRY[DURABLE_RUN_PROFILE].retention.cloud_safe_only,
        ),
    )
