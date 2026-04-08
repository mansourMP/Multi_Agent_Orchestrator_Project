from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CANONICAL_DOC = ROOT / "docs" / "EMPYRALIS_CANONICAL_ARCHITECTURE.md"
FINAL_AUDIT_DOC = ROOT / "docs" / "EMPYRALIS_FINAL_COMPLIANCE_AUDIT.md"
DOCKER_COMPOSE = ROOT / "docker-compose.yml"
ENTERPRISE_BASELINE_DOC = ROOT / "docs" / "EMPYRALIS_ENTERPRISE_BASELINE.md"
RELIABILITY_METRICS_DOC = ROOT / "docs" / "EMPYRALIS_RELIABILITY_METRICS.md"
CI_WORKFLOW = ROOT / ".github" / "workflows" / "ci.yml"
SECURITY_WORKFLOW = ROOT / ".github" / "workflows" / "security-baseline.yml"
SUPPLY_CHAIN_WORKFLOW = ROOT / ".github" / "workflows" / "supply-chain.yml"
RELEASE_WORKFLOW = ROOT / ".github" / "workflows" / "build.yml"


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
