from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CANONICAL_DOC = ROOT / "docs" / "EMPYRALIS_CANONICAL_ARCHITECTURE.md"
FINAL_AUDIT_DOC = ROOT / "docs" / "EMPYRALIS_FINAL_COMPLIANCE_AUDIT.md"
DOCKER_COMPOSE = ROOT / "docker-compose.yml"


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
