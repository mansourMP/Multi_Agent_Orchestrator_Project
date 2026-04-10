from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CANONICAL_DOC = ROOT / "docs" / "EMPYRALIS_CANONICAL_ARCHITECTURE.md"
FINAL_AUDIT_DOC = ROOT / "docs" / "EMPYRALIS_FINAL_COMPLIANCE_AUDIT.md"
DOCS_INDEX = ROOT / "docs" / "README.md"
ROOT_README = ROOT / "README.md"
DOCKER_COMPOSE = ROOT / "docker-compose.yml"
ENTERPRISE_BASELINE_DOC = ROOT / "docs" / "EMPYRALIS_ENTERPRISE_BASELINE.md"
OPEN_CORE_BOUNDARY_DOC = ROOT / "docs" / "EMPYRALIS_OPEN_CORE_BOUNDARY.md"
OPEN_CORE_BOUNDARY_MAP = ROOT / "config" / "open_core_boundary.json"
PRODUCT_SURFACES_DOC = ROOT / "docs" / "EMPYRALIS_PRODUCT_SURFACES.md"
PRODUCT_SURFACE_MAP = ROOT / "config" / "product_surface_map.json"
SURFACE_PARITY_DOC = ROOT / "docs" / "EMPYRALIS_SURFACE_PARITY_CONTRACT.md"
SURFACE_PARITY_MAP = ROOT / "config" / "surface_parity_contract_map.json"
CAPTAIN_SPECIALIST_DOC = ROOT / "docs" / "EMPYRALIS_CAPTAIN_SPECIALIST_ARCHITECTURE.md"
CAPTAIN_SPECIALIST_MAP = ROOT / "config" / "captain_specialist_runtime_map.json"
APPLICATION_RUNTIME_DOC = ROOT / "docs" / "EMPYRALIS_APPLICATION_RUNTIME_CONTRACTS.md"
APPLICATION_RUNTIME_MAP = ROOT / "config" / "application_runtime_contract_map.json"
ACTIVITY_TIMELINE_DOC = ROOT / "docs" / "EMPYRALIS_AGENT_ACTIVITY_TIMELINE.md"
ACTIVITY_TIMELINE_MAP = ROOT / "config" / "agent_activity_timeline_map.json"
LOCAL_RUNTIME_CLUSTER_DOC = ROOT / "docs" / "EMPYRALIS_LOCAL_RUNTIME_CLUSTER.md"
LOCAL_RUNTIME_CLUSTER_MAP = ROOT / "config" / "local_runtime_cluster_map.json"
HYBRID_SYNC_POLICY_DOC = ROOT / "docs" / "EMPYRALIS_HYBRID_SYNC_PLACEMENT_POLICY.md"
HYBRID_SYNC_POLICY_MAP = ROOT / "config" / "hybrid_sync_placement_map.json"
RELIABILITY_METRICS_DOC = ROOT / "docs" / "EMPYRALIS_RELIABILITY_METRICS.md"
CI_WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
SECURITY_WORKFLOW = ROOT / ".github" / "workflows" / "security-baseline.yml"
SUPPLY_CHAIN_WORKFLOW = ROOT / ".github" / "workflows" / "supply-chain.yml"
RELEASE_WORKFLOW = ROOT / ".github" / "workflows" / "build.yml"
MOBILE_README = ROOT / "mobile" / "README.md"
DESKTOP_DISTRIBUTION_DOC = ROOT / "docs" / "DESKTOP_DISTRIBUTION_STRATEGY.md"
DESKTOP_APP_DOC = ROOT / "docs" / "EMPYRALIS_DESKTOP_APP.md"
FRONTEND_README = ROOT / "frontend" / "README.md"
MOBILE_TABS_LAYOUT = ROOT / "mobile" / "app" / "(tabs)" / "_layout.tsx"


def test_canonical_architecture_matches_active_coordination_substrate() -> None:
    text = CANONICAL_DOC.read_text(encoding="utf-8")
    assert "Redis" not in text
    assert "runtime state stores, local queues, and worker heartbeats" in text


def test_final_audit_no_longer_lists_redis_as_a_current_blocker() -> None:
    text = FINAL_AUDIT_DOC.read_text(encoding="utf-8")
    assert "Redis is still a target-state dependency" not in text
    assert "Redis data-plane completion" not in text


def test_root_compose_no_longer_requires_redis_service() -> None:
    text = DOCKER_COMPOSE.read_text(encoding="utf-8")
    assert "\n  redis:\n" not in text
    assert "\n      - redis\n" not in text


def test_browser_boundary_is_documented_as_permanent_not_temporary() -> None:
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    final_audit = FINAL_AUDIT_DOC.read_text(encoding="utf-8")

    assert "intentionally Python-owned" in canonical
    assert "temporary Playwright-based adapter" not in canonical
    assert "browser automation is still temporarily Python-owned" not in final_audit.lower()


def test_memory_convergence_is_no_longer_listed_as_a_current_blocker() -> None:
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    final_audit = FINAL_AUDIT_DOC.read_text(encoding="utf-8")

    assert "runtime_memory.py" not in canonical
    assert "runtime_memory.py" not in final_audit
    assert "memory has one public facade, but the internals are still split" not in final_audit.lower()


def test_object_storage_is_documented_as_s3_production_with_filesystem_dev_fallback() -> None:
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    final_audit = FINAL_AUDIT_DOC.read_text(encoding="utf-8")

    assert "Artifact store: S3-compatible object storage" in canonical
    assert "filesystem development fallback" in canonical.lower()
    assert "active development backend is still filesystem-backed" not in final_audit.lower()


def test_enterprise_baseline_is_documented_as_real_but_not_full_depth() -> None:
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    final_audit = FINAL_AUDIT_DOC.read_text(encoding="utf-8")
    enterprise = ENTERPRISE_BASELINE_DOC.read_text(encoding="utf-8")

    assert "Enterprise hardening now has a real baseline" in canonical
    assert "PR/main CI, dependency review, secrets scanning, SBOM generation, release provenance attestation" in canonical
    assert "Fully Implemented Baseline" in enterprise
    assert "Partially Scaffolded Baseline" in enterprise
    assert "Enterprise hardening is still incomplete." not in final_audit


def test_enterprise_baseline_workflows_exist_and_cover_ci_scanning_and_attestation() -> None:
    ci = CI_WORKFLOW.read_text(encoding="utf-8")
    security = SECURITY_WORKFLOW.read_text(encoding="utf-8")
    supply_chain = SUPPLY_CHAIN_WORKFLOW.read_text(encoding="utf-8")
    release = RELEASE_WORKFLOW.read_text(encoding="utf-8")

    assert "python -m pytest server_modules/tests" in ci
    assert "./node_modules/.bin/tsc --noEmit" in ci
    assert "actions/dependency-review-action" in security
    assert "gitleaks/gitleaks-action" in security
    assert "pip-audit" in security
    assert "anchore/sbom-action" in supply_chain
    assert "actions/attest-build-provenance" in supply_chain
    assert "actions/attest-build-provenance" in release


def test_reliability_metrics_are_documented_and_no_longer_listed_as_missing() -> None:
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    final_audit = FINAL_AUDIT_DOC.read_text(encoding="utf-8")
    reliability = RELIABILITY_METRICS_DOC.read_text(encoding="utf-8")

    assert "/runtime/runtimes/reliability" in canonical
    assert "EMPYRALIS_RELIABILITY_METRICS.md" in canonical
    assert "control-plane api health and latency" in reliability.lower()
    assert "Historical gaps before this instrumentation existed are not backfilled." in reliability
    assert "there is not yet a measurable SLO dashboard" not in final_audit
    assert "| Reliability Targets | Aligned |" in final_audit


def test_final_audit_is_literally_closed_at_one_hundred_percent() -> None:
    text = FINAL_AUDIT_DOC.read_text(encoding="utf-8")

    assert "Weighted compliance score against the Bible: `100%`" in text
    assert "## Exact Remaining Blockers\n\nNone." in text
    assert "| Partial |" not in text
    assert "| Deferred |" not in text
    assert "accepted canonical boundaries" in text.lower()


def test_canonical_doc_records_the_final_accepted_boundaries() -> None:
    text = CANONICAL_DOC.read_text(encoding="utf-8")

    assert "## Current Accepted Canonical Boundaries" in text
    assert "Circuit-breaker protection is explicit, but distributed." in text
    assert "Capability coverage is family-based and environment-scoped." in text
    assert "### Canonical Delegates And Thin Wrappers" in text
    assert "This is the architecture Empyralis follows." in text


def test_open_core_boundary_is_documented_in_authoritative_docs() -> None:
    root_readme = ROOT_README.read_text(encoding="utf-8")
    docs_index = DOCS_INDEX.read_text(encoding="utf-8")
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    boundary = OPEN_CORE_BOUNDARY_DOC.read_text(encoding="utf-8")

    assert "EMPYRALIS_OPEN_CORE_BOUNDARY.md" in root_readme
    assert "EMPYRALIS_OPEN_CORE_BOUNDARY.md" in docs_index
    assert "EMPYRALIS_OPEN_CORE_BOUNDARY.md" in canonical
    assert "## Recommended Boundary Map" in boundary
    assert "## Managed-Cloud Moat Definition" in boundary
    assert "## Self-Host And Enterprise Carve-Out" in boundary


def test_open_core_boundary_map_classifies_required_subsystems_exactly() -> None:
    payload = json.loads(OPEN_CORE_BOUNDARY_MAP.read_text(encoding="utf-8"))
    allowed = {"open_source", "source_available", "managed_cloud_only", "enterprise_self_host_only"}
    assert set(payload["distribution_classes"]) == allowed

    component_map = {
        str(item["id"]): str(item["distribution"])
        for item in payload["components"]
    }
    assert component_map["local_runtime_daemon"] == "open_source"
    assert component_map["desktop_app_shell"] == "open_source"
    assert component_map["mobile_clients"] == "source_available"
    assert component_map["plugin_skill_sdk"] == "open_source"
    assert component_map["hosted_control_plane"] == "managed_cloud_only"
    assert component_map["cloud_sage_runtime"] == "managed_cloud_only"
    assert component_map["managed_scheduler_background_automation"] == "managed_cloud_only"
    assert component_map["managed_memory_sync"] == "managed_cloud_only"
    assert component_map["connector_framework_and_vault_framework"] == "source_available"
    assert component_map["shared_secure_vault_and_hosted_connector_operations"] == "managed_cloud_only"
    assert component_map["billing_subscriptions_and_saas_org_operations"] == "managed_cloud_only"
    assert component_map["private_control_plane_package"] == "enterprise_self_host_only"
    assert component_map["private_sage_runtime_cluster"] == "enterprise_self_host_only"
    assert component_map["private_scheduler_and_sync_services"] == "enterprise_self_host_only"
    assert component_map["private_vault_and_connector_runners"] == "enterprise_self_host_only"
    assert component_map["enterprise_identity_and_admin_pack"] == "enterprise_self_host_only"


def test_product_surface_boundary_is_documented_in_authoritative_docs() -> None:
    root_readme = ROOT_README.read_text(encoding="utf-8")
    docs_index = DOCS_INDEX.read_text(encoding="utf-8")
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    surfaces = PRODUCT_SURFACES_DOC.read_text(encoding="utf-8")

    assert "EMPYRALIS_PRODUCT_SURFACES.md" in root_readme
    assert "EMPYRALIS_PRODUCT_SURFACES.md" in docs_index
    assert "EMPYRALIS_PRODUCT_SURFACES.md" in canonical
    assert "## Mobile-First Product Map" in surfaces
    assert "## Desktop-Power Product Map" in surfaces
    assert "## Pairing And Runtime Attachment Placement" in surfaces


def test_product_surface_map_and_docs_lock_mobile_first_desktop_power_split() -> None:
    payload = json.loads(PRODUCT_SURFACE_MAP.read_text(encoding="utf-8"))
    mobile_readme = MOBILE_README.read_text(encoding="utf-8")
    desktop_distribution = DESKTOP_DISTRIBUTION_DOC.read_text(encoding="utf-8")
    desktop_app = DESKTOP_APP_DOC.read_text(encoding="utf-8")
    frontend_readme = FRONTEND_README.read_text(encoding="utf-8")
    mobile_tabs_layout = MOBILE_TABS_LAYOUT.read_text(encoding="utf-8")

    assert payload["mobile_first"]["daily_use_default"] is True
    assert payload["mobile_first"]["bottom_tabs"] == [
        "Home",
        "Chat",
        "Applications",
        "Notifications",
        "Profile",
    ]
    assert payload["shared_core"]["sage_identity"] == "shared"
    assert payload["shared_core"]["workspace_model"] == "shared"
    assert payload["shared_core"]["memory_system"] == "shared"
    assert payload["shared_core"]["specialist_installs"] == "shared"
    assert payload["shared_core"]["runtime_attachments"] == "shared"
    assert "Mobile is the default daily-use product surface" in mobile_readme
    assert "`Chat`" in mobile_readme
    assert "`Applications`" in mobile_readme
    assert "`Notifications`" in mobile_readme
    assert "`Profile`" in mobile_readme
    assert 'options={{ title: "Home" }}' in mobile_tabs_layout
    assert 'options={{ title: "Chat" }}' in mobile_tabs_layout
    assert 'options={{ title: "Applications" }}' in mobile_tabs_layout
    assert 'options={{ title: "Notifications" }}' in mobile_tabs_layout
    assert 'options={{ title: "Profile" }}' in mobile_tabs_layout
    assert "desktop-power for deep control" in desktop_distribution
    assert "power-user, builder, and control surface" in desktop_app
    assert "browser-hosted workspace for Empyralis" in frontend_readme


def test_surface_parity_contract_is_documented_in_authoritative_docs() -> None:
    root_readme = ROOT_README.read_text(encoding="utf-8")
    docs_index = DOCS_INDEX.read_text(encoding="utf-8")
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    product_surfaces = PRODUCT_SURFACES_DOC.read_text(encoding="utf-8")
    captain_boundary = CAPTAIN_SPECIALIST_DOC.read_text(encoding="utf-8")
    parity_doc = SURFACE_PARITY_DOC.read_text(encoding="utf-8")

    assert "EMPYRALIS_SURFACE_PARITY_CONTRACT.md" in root_readme
    assert "EMPYRALIS_SURFACE_PARITY_CONTRACT.md" in docs_index
    assert "EMPYRALIS_SURFACE_PARITY_CONTRACT.md" in canonical
    assert "EMPYRALIS_SURFACE_PARITY_CONTRACT.md" in product_surfaces
    assert "EMPYRALIS_SURFACE_PARITY_CONTRACT.md" in captain_boundary
    assert "## Surface Parity Rule" in parity_doc
    assert "## Shared Platform Contract" in parity_doc
    assert "## Allowed Surface Differences" in parity_doc
    assert "## Forbidden Surface Divergence" in parity_doc
    assert "## Capability Determinants" in parity_doc


def test_surface_parity_map_locks_same_platform_no_downgrade_contract() -> None:
    payload = json.loads(SURFACE_PARITY_MAP.read_text(encoding="utf-8"))

    shared_contract = payload["shared_platform_contract"]
    assert shared_contract["platform"] == "same"
    assert shared_contract["engine"] == "same"
    assert shared_contract["sage"] == "same"
    assert shared_contract["specialists"] == "same"
    assert shared_contract["memory_model"] == "same"
    assert shared_contract["runtime_placement_model"] == "same"
    assert shared_contract["policy_model"] == "same"

    assert payload["identical_across_surfaces"] == [
        "identity_model",
        "workspace_model",
        "sage_orchestration_model",
        "specialist_power_model",
        "specialist_memory_boundaries",
        "application_runtime_contracts",
        "runtime_routing_behavior",
        "approval_semantics",
        "policy_enforcement_semantics",
        "auditability",
    ]

    assert payload["allowed_surface_differences"] == [
        "navigation_structure",
        "information_density",
        "control_depth",
        "builder_ergonomics",
        "admin_and_debug_ergonomics",
        "inspection_depth",
    ]

    assert payload["forbidden_surface_divergence"] == [
        "weaker_execution_from_mobile_origin",
        "weaker_specialists_from_app_origin",
        "different_backend_semantics_between_mobile_and_desktop",
        "hidden_mobile_only_memory_restrictions_without_policy",
        "hidden_desktop_only_power_paths_outside_runtime_and_policy",
        "ui_origin_based_capability_downgrades",
    ]

    assert payload["capability_determinants"] == [
        "runtime_availability",
        "policy",
        "connector_scope",
        "memory_scope",
        "approval_state",
    ]

    app_parity = payload["applications_under_parity"]
    assert app_parity["mobile_primary_consumer_surface"] is True
    assert app_parity["desktop_management_and_inspection_views_allowed"] is True
    assert app_parity["backend_semantics"] == "identical"
    assert app_parity["execution_contracts"] == "identical"
    assert app_parity["inherits_sage_memory_by_default"] is False
    assert app_parity["inherits_specialist_memory_by_default"] is False

    sage_parity = payload["sage_and_specialist_parity"]["sage"]
    assert sage_parity["orchestration_model"] == "same"
    assert sage_parity["power_model"] == "same"
    assert sage_parity["runtime_routing"] == "same"
    assert sage_parity["memory_boundaries"] == "same"

    specialist_parity = payload["sage_and_specialist_parity"]["specialists"]
    assert specialist_parity["orchestration_model"] == "same"
    assert specialist_parity["power_model"] == "same"
    assert specialist_parity["runtime_routing"] == "same"
    assert specialist_parity["memory_boundaries"] == "same"

    assert payload["desktop_only_depth"] == [
        "runtime_attachment_management",
        "memory_privacy_configuration",
        "specialist_builder_flows",
        "deeper_activity_review",
        "debug_and_admin_depth",
    ]


def test_captain_specialist_boundary_is_documented_in_authoritative_docs() -> None:
    root_readme = ROOT_README.read_text(encoding="utf-8")
    docs_index = DOCS_INDEX.read_text(encoding="utf-8")
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    boundary = CAPTAIN_SPECIALIST_DOC.read_text(encoding="utf-8")

    assert "EMPYRALIS_CAPTAIN_SPECIALIST_ARCHITECTURE.md" in root_readme
    assert "EMPYRALIS_CAPTAIN_SPECIALIST_ARCHITECTURE.md" in docs_index
    assert "EMPYRALIS_CAPTAIN_SPECIALIST_ARCHITECTURE.md" in canonical
    assert "## Four-Layer Model" in boundary
    assert "## Memory Routing Model" in boundary
    assert "## Runtime And Sandbox Boundary Model" in boundary
    assert "## Local, Cloud, And Hybrid Behavior" in boundary
    assert "## Activity And Observability Model" in boundary


def test_captain_specialist_runtime_map_locks_required_boundaries() -> None:
    payload = json.loads(CAPTAIN_SPECIALIST_MAP.read_text(encoding="utf-8"))

    assert payload["shared_identity"]["account"] == "shared"
    assert payload["shared_identity"]["workspace"] == "shared"
    assert payload["shared_identity"]["sage_identity"] == "shared"
    assert payload["shared_identity"]["deployment_modes"] == ["cloud", "local", "hybrid"]

    layers = payload["layers"]
    assert layers["personal_captain"]["role"] == "private_main_agent"
    assert layers["personal_captain"]["memory_access"] == "broad_policy_bound"
    assert layers["personal_captain"]["tool_access"] == "brokered"
    assert layers["specialist_agents"]["role"] == "scoped_operational_workers"
    assert layers["specialist_agents"]["memory_access"] == "install_scoped_default"
    assert layers["specialist_agents"]["runtime_boundary"] == "separate_scoped_sandbox"
    assert layers["applications"]["role"] == "product_modules"
    assert layers["applications"]["default_memory_access"] == "app_owned_only"
    assert layers["applications"]["inherits_sage_memory"] is False
    assert layers["applications"]["inherits_specialist_memory"] is False
    assert layers["applications"]["agent_bridge_mode"] == "explicit_contract_only"
    assert layers["platform_control_plane"]["role"] == "orchestration_and_policy_system_of_record"

    memory_routing = payload["memory_routing"]
    assert memory_routing["sage_direct_read"] == [
        "profile_memory",
        "episodic_memory",
        "app_history_summaries",
        "connector_history_summaries",
        "allowed_documents_and_retrieval",
    ]
    assert memory_routing["sage_summary_only"] == [
        "specialist_activity_history",
        "specialist_artifacts",
        "local_private_memory_summaries",
        "app_operational_history",
    ]
    assert memory_routing["specialist_direct_read"] == [
        "install_scoped_memory",
        "explicitly_shared_memory",
        "manifest_allowed_retrieval",
        "scoped_artifacts",
    ]
    assert memory_routing["application_direct_read"] == [
        "app_owned_history",
        "user_selected_inputs",
        "app_owned_structured_data",
        "explicit_agent_bridges",
    ]

    runtime_boundaries = payload["runtime_boundaries"]
    assert runtime_boundaries["platform_boundary"] == "control_plane_and_brokers"
    assert runtime_boundaries["sage_boundary"] == "broad_policy_bound_agent_boundary"
    assert runtime_boundaries["specialist_boundary"] == "separate_scoped_runtime"
    assert runtime_boundaries["application_boundary"] == "product_module_runtime_boundary"

    activity_model = payload["activity_model"]
    assert activity_model["notifications_surface"] == "lightweight_daily_activity"
    assert activity_model["desktop_power_surface"] == "deeper_agent_activity_and_control"
    assert activity_model["event_types"] == [
        "delegated_work",
        "task_completed",
        "artifact_created",
        "blocked_action",
        "approval_needed",
        "status_changed",
    ]


def test_application_runtime_contracts_are_documented_in_authoritative_docs() -> None:
    root_readme = ROOT_README.read_text(encoding="utf-8")
    docs_index = DOCS_INDEX.read_text(encoding="utf-8")
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    captain_boundary = CAPTAIN_SPECIALIST_DOC.read_text(encoding="utf-8")
    application_runtime = APPLICATION_RUNTIME_DOC.read_text(encoding="utf-8")

    assert "EMPYRALIS_APPLICATION_RUNTIME_CONTRACTS.md" in root_readme
    assert "EMPYRALIS_APPLICATION_RUNTIME_CONTRACTS.md" in docs_index
    assert "EMPYRALIS_APPLICATION_RUNTIME_CONTRACTS.md" in canonical
    assert "EMPYRALIS_APPLICATION_RUNTIME_CONTRACTS.md" in captain_boundary
    assert "## Application Runtime Model" in application_runtime
    assert "## Direct Application Capabilities" in application_runtime
    assert "## Default Denials" in application_runtime
    assert "## Bridge Contracts" in application_runtime
    assert "## App Context Envelope" in application_runtime
    assert "## Allowed Bridge Paths" in application_runtime


def test_application_runtime_contract_map_locks_app_agent_separation() -> None:
    payload = json.loads(APPLICATION_RUNTIME_MAP.read_text(encoding="utf-8"))

    application_runtime = payload["application_runtime"]
    assert application_runtime["identity_fields"] == [
        "app_id",
        "workspace_id",
        "actor_scope",
        "surface_origin",
    ]
    assert application_runtime["scope_model"] == "app_scoped_separate_from_captain_and_specialists"
    assert application_runtime["storage_context"] == [
        "app_owned_history",
        "app_workflow_state",
        "scoped_documents_and_structured_records",
        "user_selected_inputs",
        "connector_backed_app_state",
        "optional_explicit_imports_from_sage",
    ]
    assert application_runtime["api_runtime_envelope"] == [
        "app_identity",
        "actor_identity",
        "app_owned_context",
        "explicit_imported_context",
        "allowed_operations",
        "runtime_target",
    ]

    direct_capabilities = payload["direct_capabilities"]
    assert direct_capabilities["allowed"] == [
        "model_calls",
        "workflow_execution",
        "structured_backend_actions",
        "connector_backed_actions",
        "app_scoped_retrieval",
    ]
    assert direct_capabilities["denied_by_default"] == [
        "read_sage_memory",
        "read_specialist_memory",
        "access_user_private_context_without_explicit_contract",
        "call_unrestricted_tools_outside_app_policy",
        "silently_impersonate_sage",
        "silently_impersonate_specialist",
    ]

    bridge_contracts = payload["bridge_contracts"]
    assert bridge_contracts["app_to_sage"] == [
        "summary_request",
        "context_import_request",
        "recommendation_request",
        "delegation_request",
    ]
    assert bridge_contracts["app_to_specialist"] == [
        "task_request",
        "artifact_request",
        "status_request",
    ]
    assert bridge_contracts["sage_to_app"] == [
        "launch_app_flow",
        "handoff_to_app",
        "request_app_action",
    ]
    assert bridge_contracts["app_to_connector_runtime"] == [
        "brokered_connector_action",
        "brokered_workflow_runtime",
        "brokered_structured_backend_route",
    ]

    context_envelope = payload["context_envelope"]
    assert context_envelope["default_classes"] == [
        "user_selected_inputs",
        "app_owned_history",
        "scoped_documents_and_data",
        "app_workflow_state",
    ]
    assert context_envelope["optional_classes"] == [
        "explicit_imports_from_sage",
        "explicit_summaries_from_specialists",
        "explicit_shared_artifacts",
    ]
    assert context_envelope["inherits_sage_memory_by_default"] is False
    assert context_envelope["inherits_specialist_memory_by_default"] is False

    cross_surface = payload["cross_surface_contract"]
    assert cross_surface["mobile"] == "same_contract"
    assert cross_surface["desktop_power"] == "same_contract"
    assert cross_surface["cloud"] == "same_contract"


def test_agent_activity_timeline_is_documented_in_authoritative_docs() -> None:
    root_readme = ROOT_README.read_text(encoding="utf-8")
    docs_index = DOCS_INDEX.read_text(encoding="utf-8")
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    captain_boundary = CAPTAIN_SPECIALIST_DOC.read_text(encoding="utf-8")
    activity_doc = ACTIVITY_TIMELINE_DOC.read_text(encoding="utf-8")
    product_surfaces = PRODUCT_SURFACES_DOC.read_text(encoding="utf-8")

    assert "EMPYRALIS_AGENT_ACTIVITY_TIMELINE.md" in root_readme
    assert "EMPYRALIS_AGENT_ACTIVITY_TIMELINE.md" in docs_index
    assert "EMPYRALIS_AGENT_ACTIVITY_TIMELINE.md" in canonical
    assert "EMPYRALIS_AGENT_ACTIVITY_TIMELINE.md" in captain_boundary
    assert "lightweight activity summaries" in product_surfaces
    assert "deeper activity timeline and review" in product_surfaces
    assert "## Durable Activity Event Model" in activity_doc
    assert "## Actor Identity" in activity_doc
    assert "## Event Classes And Retention" in activity_doc
    assert "## Summary Vs Detail Levels" in activity_doc
    assert "## Product Surface Placement" in activity_doc
    assert "## Sage Activity Ingestion" in activity_doc
    assert "## Artifact Visibility" in activity_doc
    assert "## Memory Timeline Model" in activity_doc


def test_agent_activity_timeline_map_locks_event_model_and_surface_split() -> None:
    payload = json.loads(ACTIVITY_TIMELINE_MAP.read_text(encoding="utf-8"))

    activity_model = payload["activity_event_model"]
    assert activity_model["required_actor_fields"] == [
        "actor_type",
        "actor_id",
        "workspace_id",
    ]
    assert activity_model["optional_scope_fields"] == [
        "install_id",
        "app_id",
        "run_id",
        "thread_id",
    ]
    assert activity_model["event_classes"] == [
        "sage_activity",
        "specialist_activity",
        "application_activity",
        "delegation",
        "artifact_activity",
        "approval_state",
        "blocked_action",
        "memory_update",
        "connector_action",
    ]
    assert activity_model["retention_tiers"] == [
        "feed_window",
        "timeline_window",
        "audit_archive",
    ]

    assert payload["detail_levels"] == [
        "feed_summary",
        "timeline_detail",
        "audit_reference",
    ]

    surface_placement = payload["surface_placement"]
    assert surface_placement["notifications"] == "lightweight_daily_stream"
    assert surface_placement["desktop_power_timeline"] == "deeper_reviewable_history"
    assert surface_placement["mobile"] == "safe_summaries_only"

    sage_ingestion = payload["sage_ingestion"]
    assert sage_ingestion["allowed_summary_inputs"] == [
        "recent_specialist_work",
        "recent_application_activity",
        "pending_review_items",
        "blocked_action_summaries",
        "artifact_activity",
        "memory_update_summaries",
    ]
    assert sage_ingestion["raw_internal_access"] is False

    artifact_visibility = payload["artifact_visibility"]
    assert artifact_visibility["supports"] == [
        "created_files",
        "updated_files",
        "linked_artifacts",
        "previews",
        "review_needed_markers",
    ]

    memory_timeline = payload["memory_timeline"]
    assert memory_timeline["event_classes"] == [
        "profile_memory_updated",
        "episodic_summary_refreshed",
        "specialist_memory_checkpoint_created",
        "app_history_checkpoint_updated",
    ]
    assert memory_timeline["full_memory_dump_in_feed"] is False


def test_local_runtime_cluster_is_documented_in_authoritative_docs() -> None:
    root_readme = ROOT_README.read_text(encoding="utf-8")
    docs_index = DOCS_INDEX.read_text(encoding="utf-8")
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    captain_boundary = CAPTAIN_SPECIALIST_DOC.read_text(encoding="utf-8")
    local_execution_boundary = (ROOT / "docs" / "EMPYRALIS_LOCAL_EXECUTION_BOUNDARY.md").read_text(encoding="utf-8")
    local_cluster = LOCAL_RUNTIME_CLUSTER_DOC.read_text(encoding="utf-8")

    assert "EMPYRALIS_LOCAL_RUNTIME_CLUSTER.md" in root_readme
    assert "EMPYRALIS_LOCAL_RUNTIME_CLUSTER.md" in docs_index
    assert "EMPYRALIS_LOCAL_RUNTIME_CLUSTER.md" in canonical
    assert "EMPYRALIS_LOCAL_RUNTIME_CLUSTER.md" in captain_boundary
    assert "EMPYRALIS_LOCAL_RUNTIME_CLUSTER.md" in local_execution_boundary
    assert "## Local Runtime Cluster Model" in local_cluster
    assert "## Sandbox Boundaries" in local_cluster
    assert "## Local Worker Lifecycle" in local_cluster
    assert "## Shared Identity And Attachment Model" in local_cluster
    assert "## Local-Private Memory Rule" in local_cluster
    assert "## Local Specialist Isolation" in local_cluster
    assert "## Artifact And Summary Surfacing" in local_cluster


def test_local_runtime_cluster_map_locks_local_identity_isolation_and_lifecycle() -> None:
    payload = json.loads(LOCAL_RUNTIME_CLUSTER_MAP.read_text(encoding="utf-8"))

    shared_identity = payload["shared_identity"]
    assert shared_identity["account"] == "shared"
    assert shared_identity["workspace"] == "shared"
    assert shared_identity["sage_identity"] == "shared"
    assert shared_identity["deployment_modes"] == [
        "local",
        "cloud",
        "hybrid",
    ]

    cluster_model = payload["cluster_model"]
    assert cluster_model["required_parts"] == [
        "local_sage_runtime",
        "local_specialist_runtimes",
        "local_runtime_supervisor",
        "local_memory_stores",
        "local_artifact_bridge",
    ]
    assert cluster_model["different_product"] is False

    sandbox_boundaries = payload["sandbox_boundaries"]
    assert sandbox_boundaries["sage"] == "local_captain_boundary"
    assert sandbox_boundaries["specialists"] == "separate_scoped_sandboxes"
    assert sandbox_boundaries["applications"] == "separate_product_module_boundary"

    assert payload["worker_lifecycle"] == [
        "register",
        "start",
        "health_heartbeat",
        "stop",
        "revoke",
        "recover",
    ]

    local_memory = payload["local_memory"]
    assert local_memory["private_memory_default"] == "local_only"
    assert local_memory["allowed_summary_bridge"] is True
    assert local_memory["automatic_full_sync_to_cloud"] is False
    assert local_memory["stores"] == [
        "local_private_captain_memory",
        "local_specialist_scoped_memory",
        "local_app_owned_state",
        "local_retrieval_indexes",
    ]

    specialist_isolation = payload["local_specialist_isolation"]
    assert specialist_isolation["separate_tools"] is True
    assert specialist_isolation["separate_connectors"] is True
    assert specialist_isolation["separate_memory"] is True
    assert specialist_isolation["separate_artifacts"] is True
    assert specialist_isolation["separate_runtime_policy"] is True

    artifact_bridge = payload["artifact_bridge"]
    assert artifact_bridge["supports"] == [
        "local_file_creation_references",
        "artifact_previews",
        "summary_publication_to_sage",
        "review_needed_markers",
    ]
    assert artifact_bridge["raw_filesystem_dump"] is False


def test_hybrid_sync_policy_is_documented_in_authoritative_docs() -> None:
    root_readme = ROOT_README.read_text(encoding="utf-8")
    docs_index = DOCS_INDEX.read_text(encoding="utf-8")
    canonical = CANONICAL_DOC.read_text(encoding="utf-8")
    captain_boundary = CAPTAIN_SPECIALIST_DOC.read_text(encoding="utf-8")
    local_cluster = LOCAL_RUNTIME_CLUSTER_DOC.read_text(encoding="utf-8")
    product_surfaces = PRODUCT_SURFACES_DOC.read_text(encoding="utf-8")
    hybrid_policy = HYBRID_SYNC_POLICY_DOC.read_text(encoding="utf-8")

    assert "EMPYRALIS_HYBRID_SYNC_PLACEMENT_POLICY.md" in root_readme
    assert "EMPYRALIS_HYBRID_SYNC_PLACEMENT_POLICY.md" in docs_index
    assert "EMPYRALIS_HYBRID_SYNC_PLACEMENT_POLICY.md" in canonical
    assert "EMPYRALIS_HYBRID_SYNC_PLACEMENT_POLICY.md" in captain_boundary
    assert "EMPYRALIS_HYBRID_SYNC_PLACEMENT_POLICY.md" in local_cluster
    assert "hybrid state summaries" in product_surfaces
    assert "hybrid sync and placement controls" in product_surfaces
    assert "## Hybrid Sync Model" in hybrid_policy
    assert "## Sync Policy Classes" in hybrid_policy
    assert "## Runtime Placement Rules" in hybrid_policy
    assert "## Fallback Behavior" in hybrid_policy
    assert "## Local / Cloud Summary Bridge" in hybrid_policy
    assert "## Mobile Interaction" in hybrid_policy
    assert "## Desktop-Power Controls" in hybrid_policy


def test_hybrid_sync_policy_map_locks_identity_sync_classes_and_fallbacks() -> None:
    payload = json.loads(HYBRID_SYNC_POLICY_MAP.read_text(encoding="utf-8"))

    shared_identity = payload["shared_identity"]
    assert shared_identity["account"] == "shared"
    assert shared_identity["workspace"] == "shared"
    assert shared_identity["sage_identity"] == "shared"
    assert shared_identity["deployment_modes"] == [
        "cloud_only",
        "local_only",
        "hybrid",
    ]

    assert payload["sync_classes"] == [
        "local_only",
        "sync_allowed",
        "summary_bridge_only",
        "explicit_opt_in",
    ]

    default_policy = payload["default_policy"]
    assert default_policy["private_local_memory"] == "local_only"
    assert default_policy["cloud_safe_shared_memory"] == "sync_allowed"
    assert default_policy["sensitive_local_activity"] == "summary_bridge_only"

    placement_rules = payload["placement_rules"]
    assert placement_rules["sage_cloud_when"] == [
        "always_on_required",
        "mobile_continuity_required",
        "task_cloud_safe",
        "local_only_memory_not_required",
    ]
    assert placement_rules["sage_local_when"] == [
        "local_private_memory_required",
        "local_files_apps_or_device_actions_required",
        "privacy_sensitive_reasoning_should_stay_local",
    ]
    assert placement_rules["specialist_local_when"] == [
        "local_tools_required",
        "local_private_context_required",
        "local_files_or_applications_required",
        "device_scoped_connectors_or_permissions_required",
    ]
    assert placement_rules["specialist_cloud_when"] == [
        "always_on_business_automation",
        "private_local_context_not_required",
        "hosted_availability_preferred",
    ]
    assert placement_rules["self_hosted_preferred_when"] == [
        "customer_controlled_compute_required",
        "compliance_or_residency_required",
        "hosted_class_workload_without_shared_managed_cloud",
    ]
    assert placement_rules["priority_order"] == [
        "privacy_and_sync_class",
        "required_capabilities_and_connectors",
        "local_vs_cloud_data_dependency",
        "availability_and_always_on_requirement",
        "user_or_workspace_policy_preference",
    ]

    fallback = payload["fallback_behavior"]
    assert fallback["local_offline"]["local_only_tasks"] == "wait_or_fail_closed"
    assert fallback["local_offline"]["summary_bridge_only"] == "use_last_safe_summary_only"
    assert fallback["local_offline"]["cloud_safe_tasks"] == "continue_in_cloud_if_policy_allows"
    assert fallback["cloud_unavailable"]["local_sage_and_specialists"] == "continue_for_local_safe_work"
    assert fallback["cloud_unavailable"]["cloud_only_automations"] == "wait_or_degrade_visibly"
    assert fallback["hybrid_degraded_mode"]["fallback"] == "policy_safe_only"
    assert fallback["hybrid_degraded_mode"]["promote_raw_private_local_memory"] is False
    assert fallback["hybrid_degraded_mode"]["user_signal"] == "summary_level_degraded_state"

    summary_bridge = payload["summary_bridge"]
    assert summary_bridge["allowed_payloads"] == [
        "bounded_local_private_summaries",
        "specialist_outcome_summaries",
        "artifact_summaries",
        "pending_review_markers",
        "selected_memory_update_summaries",
    ]
    assert summary_bridge["forbidden_payloads"] == [
        "unrestricted_raw_local_private_memory",
        "full_local_specialist_internals",
        "raw_private_file_content_without_explicit_share",
    ]

    surface = payload["surface_responsibility"]
    assert surface["mobile"] == [
        "sage_continuity",
        "runtime_attachment_summaries",
        "sync_state_summaries",
        "review_needed_items",
        "degraded_mode_notices",
    ]
    assert surface["desktop_power"] == [
        "hybrid_sync_controls",
        "placement_policy_visibility",
        "runtime_attachment_management",
        "local_cloud_preference_tuning",
        "explicit_opt_in_sync_classes",
        "deeper_degraded_state_review",
    ]
