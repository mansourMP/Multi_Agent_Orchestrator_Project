from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional


STUDIO_PROOF_AGENT_SEED_VERSION = 1


_PUBLISHER = {
    "publisher_id": "empyralis",
    "label": "Empyralis",
    "website": "https://empyralis.dev",
}


_PROOF_AGENT_SEED_CONTRACTS: List[Dict[str, Any]] = [
    {
        "slug": "shop-assistant",
        "name": "Shop Assistant",
        "category": "Retail",
        "description": "Answers product questions, checks catalog facts, captures purchase intent, and escalates checkout exceptions.",
        "persona": {
            "default_name": "Shop Assistant",
            "role": "Helpful retail sales and support specialist",
            "tone": "Warm, concise, factual, and conversion-aware",
            "editable": True,
            "instructions": [
                "Use connected product data before answering availability, fit, price, or policy questions.",
                "Offer clear next steps without inventing discounts, stock, warranties, or shipping commitments.",
                "Escalate refund, payment, high-value order, or policy-exception requests for owner approval.",
            ],
        },
        "default_data_sources": [
            {"source_id": "product_catalog", "label": "Product catalog", "kind": "spreadsheet_or_inventory", "required": False},
            {"source_id": "store_policies", "label": "Store policies", "kind": "document", "required": False},
            {"source_id": "order_faq", "label": "Order and shipping FAQ", "kind": "document", "required": False},
        ],
        "channels": [
            {"channel_key": "web_chat", "label": "Website chat", "default_enabled": True},
            {"channel_key": "telegram", "label": "Telegram", "default_enabled": True},
            {"channel_key": "whatsapp", "label": "WhatsApp", "default_enabled": False},
            {"channel_key": "email", "label": "Email", "default_enabled": False},
        ],
        "tools_skills": [
            {"id": "catalog.lookup", "label": "Catalog lookup", "default_enabled": True, "approval_required": False},
            {"id": "order.intent_capture", "label": "Purchase intent capture", "default_enabled": True, "approval_required": False},
            {"id": "handoff.owner", "label": "Owner handoff", "default_enabled": True, "approval_required": False},
            {"id": "checkout.link_prepare", "label": "Prepare checkout link", "default_enabled": False, "approval_required": True},
        ],
        "runtime_tier_recommendation": {
            "tier": "hosted_secure",
            "reason": "Catalog Q&A and lead capture can run safely in a governed hosted worker.",
            "upgrade_when": "Use local_secure only when the shop data source lives on an owner device.",
        },
        "approval_policy": {
            "default_mode": "guarded",
            "owner_approval_required_for": ["refunds", "discounts", "payment_links", "policy_exceptions", "order_cancellations"],
            "customer_live_requires_published_version": True,
        },
        "analytics_events": [
            {"event": "studio.proof.shop_assistant.installed", "purpose": "Track seed adoption"},
            {"event": "studio.proof.shop_assistant.intent_captured", "purpose": "Track qualified purchase intent"},
            {"event": "studio.proof.shop_assistant.owner_handoff", "purpose": "Track unresolved customer needs"},
        ],
        "monetization_hint": {
            "kind": "lead_capture",
            "metric": "qualified_purchase_intent",
            "suggested_offer": "Monthly storefront assistant plus usage-based customer conversations.",
        },
    },
    {
        "slug": "dental-receptionist",
        "name": "Dental Receptionist",
        "category": "Healthcare Operations",
        "description": "Handles dental office FAQs, appointment intake, routing, and receptionist handoff without making clinical decisions.",
        "persona": {
            "default_name": "Dental Receptionist",
            "role": "Front-desk dental reception specialist",
            "tone": "Calm, professional, privacy-aware, and reassuring",
            "editable": True,
            "instructions": [
                "Collect appointment intent and contact details without diagnosing or giving clinical advice.",
                "Use office policy, provider, insurance, and hours data before answering operational questions.",
                "Escalate symptoms, emergencies, billing disputes, and protected-health-information uncertainty.",
            ],
        },
        "default_data_sources": [
            {"source_id": "office_hours", "label": "Office hours and locations", "kind": "document_or_spreadsheet", "required": False},
            {"source_id": "services_and_providers", "label": "Services and providers", "kind": "document", "required": False},
            {"source_id": "insurance_faq", "label": "Insurance and billing FAQ", "kind": "document", "required": False},
        ],
        "channels": [
            {"channel_key": "web_chat", "label": "Website chat", "default_enabled": True},
            {"channel_key": "phone", "label": "Phone intake", "default_enabled": False},
            {"channel_key": "email", "label": "Email", "default_enabled": False},
            {"channel_key": "telegram", "label": "Telegram", "default_enabled": False},
        ],
        "tools_skills": [
            {"id": "appointment.intake", "label": "Appointment intake", "default_enabled": True, "approval_required": False},
            {"id": "calendar.availability_read", "label": "Availability lookup", "default_enabled": False, "approval_required": False},
            {"id": "calendar.appointment_request", "label": "Appointment request draft", "default_enabled": False, "approval_required": True},
            {"id": "handoff.receptionist", "label": "Receptionist handoff", "default_enabled": True, "approval_required": False},
        ],
        "runtime_tier_recommendation": {
            "tier": "hosted_secure",
            "reason": "Front-desk intake can run hosted when PHI-sensitive writes remain approval-gated.",
            "upgrade_when": "Use local_secure or a business node for private practice-management integrations.",
        },
        "approval_policy": {
            "default_mode": "guarded",
            "owner_approval_required_for": ["appointment_booking", "appointment_changes", "billing_commitments", "clinical_or_emergency_triage"],
            "customer_live_requires_published_version": True,
        },
        "analytics_events": [
            {"event": "studio.proof.dental_receptionist.installed", "purpose": "Track seed adoption"},
            {"event": "studio.proof.dental_receptionist.appointment_intake", "purpose": "Track appointment demand"},
            {"event": "studio.proof.dental_receptionist.receptionist_handoff", "purpose": "Track human follow-up load"},
        ],
        "monetization_hint": {
            "kind": "appointment_intake",
            "metric": "qualified_appointment_requests",
            "suggested_offer": "Monthly receptionist automation with per-location or per-provider expansion.",
        },
    },
    {
        "slug": "restaurant-order-taker",
        "name": "Restaurant Order Taker",
        "category": "Food Service",
        "description": "Answers menu questions, captures pickup or delivery order intent, confirms constraints, and escalates payments or substitutions.",
        "persona": {
            "default_name": "Restaurant Order Taker",
            "role": "Restaurant ordering and menu support specialist",
            "tone": "Friendly, quick, accurate, and hospitality-focused",
            "editable": True,
            "instructions": [
                "Use menu and operating-hours data before answering price, availability, allergen, or timing questions.",
                "Summarize order details for customer confirmation before any write or payment action.",
                "Escalate allergies, unavailable items, refunds, payment links, and delivery exceptions.",
            ],
        },
        "default_data_sources": [
            {"source_id": "menu_catalog", "label": "Menu catalog", "kind": "spreadsheet_or_inventory", "required": False},
            {"source_id": "hours_and_delivery_zones", "label": "Hours and delivery zones", "kind": "document_or_spreadsheet", "required": False},
            {"source_id": "allergen_notes", "label": "Allergen notes", "kind": "document", "required": False},
        ],
        "channels": [
            {"channel_key": "telegram", "label": "Telegram", "default_enabled": True},
            {"channel_key": "web_chat", "label": "Website chat", "default_enabled": True},
            {"channel_key": "whatsapp", "label": "WhatsApp", "default_enabled": False},
            {"channel_key": "phone", "label": "Phone intake", "default_enabled": False},
        ],
        "tools_skills": [
            {"id": "menu.lookup", "label": "Menu lookup", "default_enabled": True, "approval_required": False},
            {"id": "order.capture", "label": "Order capture", "default_enabled": True, "approval_required": False},
            {"id": "order.confirmation_draft", "label": "Order confirmation draft", "default_enabled": True, "approval_required": True},
            {"id": "handoff.staff", "label": "Staff handoff", "default_enabled": True, "approval_required": False},
        ],
        "runtime_tier_recommendation": {
            "tier": "hosted_secure",
            "reason": "Menu Q&A and order-intent capture can run hosted with write actions approval-gated.",
            "upgrade_when": "Use local_secure when orders must write into an on-premise POS or kitchen system.",
        },
        "approval_policy": {
            "default_mode": "guarded",
            "owner_approval_required_for": ["order_submission", "payment_links", "refunds", "allergen_exceptions", "delivery_exceptions"],
            "customer_live_requires_published_version": True,
        },
        "analytics_events": [
            {"event": "studio.proof.restaurant_order_taker.installed", "purpose": "Track seed adoption"},
            {"event": "studio.proof.restaurant_order_taker.order_intent_captured", "purpose": "Track order demand"},
            {"event": "studio.proof.restaurant_order_taker.staff_handoff", "purpose": "Track operational exceptions"},
        ],
        "monetization_hint": {
            "kind": "order_intake",
            "metric": "confirmed_order_intents",
            "suggested_offer": "Monthly ordering assistant plus per-channel or per-location add-ons.",
        },
    },
]


def _customization_contract() -> Dict[str, Any]:
    return {
        "persona_editable": True,
        "data_sources_extensible": True,
        "channels_extensible": True,
        "tools_skills_extensible": True,
        "approval_policy_editable": True,
        "additional_fields_allowed": True,
        "template_inputs_schema": {
            "type": "object",
            "additionalProperties": True,
            "properties": {
                "agent_name": {"type": "string"},
                "business_name": {"type": "string"},
                "persona_overrides": {"type": "object", "additionalProperties": True},
                "data_source_bindings": {"type": "object", "additionalProperties": True},
                "channel_bindings": {"type": "object", "additionalProperties": True},
                "tool_overrides": {"type": "object", "additionalProperties": True},
                "approval_policy_overrides": {"type": "object", "additionalProperties": True},
            },
        },
    }


def _with_contract_defaults(contract: Dict[str, Any]) -> Dict[str, Any]:
    payload = deepcopy(contract)
    payload["contract_version"] = STUDIO_PROOF_AGENT_SEED_VERSION
    payload["customization"] = _customization_contract()
    payload["proof_agent"] = True
    return payload


def list_studio_proof_agent_seed_contracts() -> List[Dict[str, Any]]:
    return [_with_contract_defaults(contract) for contract in _PROOF_AGENT_SEED_CONTRACTS]


def get_studio_proof_agent_seed_contract(slug: str) -> Optional[Dict[str, Any]]:
    normalized_slug = str(slug or "").strip().lower()
    for contract in _PROOF_AGENT_SEED_CONTRACTS:
        if contract["slug"] == normalized_slug:
            return _with_contract_defaults(contract)
    return None


def build_studio_proof_agent_marketplace_package_contracts() -> List[Dict[str, Any]]:
    packages: List[Dict[str, Any]] = []
    for contract in list_studio_proof_agent_seed_contracts():
        slug = contract["slug"]
        packages.append(
            {
                "package_id": f"studio-proof-{slug}",
                "kind": "agent_template",
                "label": contract["name"],
                "description": contract["description"],
                "category": f"Proof Agent / {contract['category']}",
                "publisher": deepcopy(_PUBLISHER),
                "onboarding": {
                    "docs_url": "/docs/studio-marketplace-ux-boundary-2026-04-30.md",
                    "installation_notes": "Seed into Agent Studio, then customize persona, data sources, channels, tools, and approval policy before publishing.",
                },
                "verification_status": "verified",
                "review_state": "approved",
                "health_state": "setup_required",
                "policy_posture": "governed",
                "approval_required": False,
                "billing": {
                    "monetization_kind": "free",
                    "accounting_hook": {
                        "ledger_key": f"studio.proof.{slug.replace('-', '_')}",
                        "hook_kind": "proof_agent_seed_install",
                    },
                },
                "analytics": {"events": deepcopy(contract["analytics_events"])},
                "agent_template": {
                    "template_id": slug,
                    "version": "0.1.0",
                    "specialist_kind": str(contract.get("category") or "custom").strip().lower(),
                    "required_connectors": [
                        str(item.get("label") or item.get("source_id") or "").strip()
                        for item in contract.get("default_data_sources", [])
                        if isinstance(item, dict) and str(item.get("label") or item.get("source_id") or "").strip()
                    ],
                    "suggested_tools": [
                        str(item.get("id") or "").strip()
                        for item in contract.get("tools_skills", [])
                        if isinstance(item, dict) and str(item.get("id") or "").strip()
                    ],
                    "setup_schema": contract["customization"]["template_inputs_schema"],
                    "launch_checklist": [
                        "Customize persona and business name.",
                        "Connect live data sources.",
                        "Select customer channels.",
                        "Review approval policy before publishing.",
                    ],
                    "context_envelope": {"proof_agent_seed_contract": contract},
                },
            }
        )
    return packages
