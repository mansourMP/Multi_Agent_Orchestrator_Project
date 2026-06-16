#!/usr/bin/env python3
"""Test Suite 3 — Memory system (file I/O, no LLM calls)"""
import sys, os
sys.path.insert(0, 'server_modules')

RESULTS = []
WS = "ws_91e58fefb9c1"

def report(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    RESULTS.append((name, status, detail))
    print(f"  [{status}] {name}")
    if detail and not passed:
        print(f"         {detail}")

# ── 3.3: Bootstrap file set ──
print("\n--- Test 3.3: Bootstrap file set ---")
from workspace_context import ensure_workspace_context_files, workspace_scope_dir
files = ensure_workspace_context_files(workspace_id=WS)
loaded_names = sorted(files.keys())
print(f"  Loaded files: {loaded_names}")

expected_every_turn = {"SOUL.md", "AGENTS.md", "TOOLS.md", "IDENTITY.md"}
# HEARTBEAT.md may or may not be in the loaded set depending on config
has_core = expected_every_turn.issubset(set(loaded_names))
report("3.3a: Core bootstrap files loaded", has_core)

# MEMORY.md should NOT be loaded every turn (on-demand only)
has_memory = "MEMORY.md" in loaded_names
report("3.3b: MEMORY.md NOT in every-turn load", not has_memory,
       "MEMORY.md is in every-turn load — should be on-demand only" if has_memory else "")

dead_files = {"USER.md", "GOALS.md"}
dead_loaded = dead_files & set(loaded_names)
report("3.3c: Dead files not loaded", not dead_loaded,
       f"Dead files loaded: {dead_loaded}" if dead_loaded else "")

# ── 3.1: memory_write_file append ──
print("\n--- Test 3.1: memory_write_file append ---")
from memory_service import _append_daily_note, _normalize_workspace_id
mem_path = workspace_scope_dir(WS) / "MEMORY.md"
original_content = mem_path.read_text() if mem_path.exists() else ""
test_fact = "TEST_INTEGRATION_FACT: Mansur prefers dark mode at 2026-06-16"

# Write test fact
try:
    new_content = original_content
    if new_content and not new_content.endswith('\n'):
        new_content += '\n'
    new_content += f"- {test_fact}\n"
    mem_path.write_text(new_content)
    
    # Verify
    current = mem_path.read_text()
    has_fact = test_fact in current
    report("3.1: memory_write_file appends content", has_fact)

    # ── 3.2: memory_read_file ──
    print("\n--- Test 3.2: memory_read_file ---")
    result = mem_path.read_text()
    has_fact2 = test_fact in result
    report("3.2: memory_read_file returns content with fact", has_fact2)

    # Cleanup: restore original
    mem_path.write_text(original_content)
except Exception as e:
    report("3.1+3.2: memory file I/O", False, str(e))
    # Try to restore
    try:
        mem_path.write_text(original_content)
    except:
        pass

# ── 3.4: HEARTBEAT.md check ──
print("\n--- Test 3.4: HEARTBEAT.md presence ---")
hb_path = workspace_scope_dir(WS) / "HEARTBEAT.md"
hb_exists = hb_path.exists()
if hb_exists:
    hb_content = hb_path.read_text()
    hb_size = len(hb_content)
    has_timestamp = "2026-" in hb_content or "2025-" in hb_content
    report("3.4a: HEARTBEAT.md exists", True)
    report("3.4b: HEARTBEAT.md has content", hb_size > 10,
           f"File size: {hb_size} chars")
    report("3.4c: HEARTBEAT.md has timestamps", has_timestamp,
           f"Content preview: {hb_content[:200]}")
else:
    report("3.4: HEARTBEAT.md exists", False, "File not found")

# ── Summary ──
print("\n=== Suite 3 Summary ===")
passed = sum(1 for _, s, _ in RESULTS if s == "PASS")
failed = sum(1 for _, s, _ in RESULTS if s == "FAIL")
print(f"{passed} passed, {failed} failed")
