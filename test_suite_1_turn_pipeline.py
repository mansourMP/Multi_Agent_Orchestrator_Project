#!/usr/bin/env python3
"""Test Suite 1 — Core turn pipeline (no LLM calls, no DB mutations)"""
import sys, os, asyncio
sys.path.insert(0, 'server_modules')

RESULTS = []

def report(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    RESULTS.append((name, status, detail))
    print(f"  [{status}] {name}")
    if detail and not passed:
        print(f"         {detail}")

# ── Test 1.5: identity link resolution (pure function, runs first) ──
print("\n--- Test 1.5: resolve_canonical_sender ---")
from sage_agent_runtime_service import resolve_canonical_sender

links = {"Mansur": ["telegram_personal:1932934047"]}
name, linked = resolve_canonical_sender(links, "telegram_personal", "1932934047")
report("1.5a: resolve known sender", name == "Mansur",
       f"Expected 'Mansur', got {name!r}")

name2, linked2 = resolve_canonical_sender(links, "telegram_personal", "999999")
report("1.5b: resolve unknown sender returns None", name2 is None,
       f"Expected None, got {name2!r}")

name3, linked3 = resolve_canonical_sender(None, "web", "123")
report("1.5c: None identity_links returns None", name3 is None)

name4, linked4 = resolve_canonical_sender(links, "telegram_personal", None)
report("1.5d: None sender_id returns None", name4 is None)

# ── Test 1.3: channel_origin reaches system prompt ──
print("\n--- Test 1.3: channel_origin in instruction bundle ---")
try:
    from sage_instruction_compiler_service import build_sage_instruction_bundle
    bundle = build_sage_instruction_bundle(
        workspace_id="ws_91e58fefb9c1",
        message="test",
        channel_origin="whatsapp_personal",
    )
    sys_prompt = bundle.system_prompt if hasattr(bundle, 'system_prompt') else str(bundle)
    has_whatsapp = "whatsapp_personal" in sys_prompt
    report("1.3: channel_origin in system prompt", has_whatsapp,
           f"System prompt sample: {sys_prompt[:200]}")
except Exception as e:
    report("1.3: channel_origin in system prompt", False, str(e))

# ── Test 1.4: sender identity reaches system prompt ──
print("\n--- Test 1.4: sender identity in instruction bundle ---")
try:
    bundle = build_sage_instruction_bundle(
        workspace_id="ws_91e58fefb9c1",
        message="test",
        channel_origin="telegram_personal",
        sender_name="Mansur",
    )
    sys_prompt = bundle.system_prompt if hasattr(bundle, 'system_prompt') else str(bundle)
    has_mansur = "Mansur" in sys_prompt
    report("1.4: sender_name in system prompt", has_mansur,
           f"System prompt sample: {sys_prompt[:300]}")
except Exception as e:
    report("1.4: sender_name in system prompt", False, str(e))

# ── Test 1.1: Web chat turn persists (requires LLM — test structure only) ──
print("\n--- Test 1.1: Web chat turn (structural) ---")
try:
    from sage_agent_runtime_service import handle_sage_chat
    import inspect
    sig = inspect.signature(handle_sage_chat)
    has_thread_id = "thread_id" in sig.parameters
    report("1.1: handle_sage_chat has thread_id param", has_thread_id,
           f"Params: {list(sig.parameters.keys())}")
except Exception as e:
    report("1.1: handle_sage_chat import", False, str(e))

# ── Summary ──
print("\n=== Suite 1 Summary ===")
passed = sum(1 for _, s, _ in RESULTS if s == "PASS")
failed = sum(1 for _, s, _ in RESULTS if s == "FAIL")
print(f"{passed} passed, {failed} failed")
