#!/usr/bin/env python3
"""Test Suite 2 — Command dispatcher (real DB calls)"""
import sys, os, asyncio
sys.path.insert(0, 'server_modules')

RESULTS = []
WS = "ws_91e58fefb9c1"

def report(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    RESULTS.append((name, status, detail))
    print(f"  [{status}] {name}")
    if detail and not passed:
        print(f"         {detail}")

async def main():
    from sage_command_dispatcher import dispatch_command, get_active_thread, SAGE_COMPACTED, SAGE_COMPACT_NOT_NEEDED

    # ── 2.1: /help ──
    print("\n--- Test 2.1: /help ---")
    r = await dispatch_command(command="/help", workspace_id=WS, channel_origin="web")
    has_all = all(cmd in (r or "") for cmd in ["/compact", "/memory", "/new", "/main"])
    report("2.1: /help contains all commands", has_all,
           f"Reply: {r[:100] if r else 'None'}")

    # ── 2.7: unknown command passes through ──
    print("\n--- Test 2.7: unknown command ---")
    r = await dispatch_command(command="/blahblah", workspace_id=WS, channel_origin="web")
    report("2.7: unknown cmd returns None (passthrough)", r is None,
           f"Got: {r!r}")

    # ── 2.6: /approve with no pending ──
    print("\n--- Test 2.6: /approve empty ---")
    r = await dispatch_command(command="/approve", workspace_id=WS, channel_origin="web")
    has_pending = "No pending" in (r or "")
    report("2.6: /approve returns no pending", has_pending,
           f"Reply: {r!r}")

    # ── 2.3: /memory returns content ──
    print("\n--- Test 2.3: /memory ---")
    # Write test content first
    from workspace_context import workspace_scope_dir
    mem_path = workspace_scope_dir(WS) / "MEMORY.md"
    test_content = "TEST_FACT: integration test marker 2026-06-16"
    prev_content = ""
    if mem_path.exists():
        prev_content = mem_path.read_text()
    mem_path.write_text(test_content)
    r = await dispatch_command(command="/memory", workspace_id=WS, channel_origin="web")
    has_fact = "TEST_FACT" in (r or "")
    # Restore
    mem_path.write_text(prev_content)
    report("2.3: /memory returns test content", has_fact,
           f"Reply: {r[:200] if r else 'None'}")

    # ── 2.4: /new creates task thread ──
    print("\n--- Test 2.4: /new ---")
    r = await dispatch_command(command="/new", workspace_id=WS, channel_origin="telegram_personal")
    is_new = "New session" in (r or "")
    report("2.4a: /new returns session message", is_new,
           f"Reply: {r!r}")

    at = await get_active_thread(WS, "telegram_personal")
    is_task = at.startswith("task-") if at else False
    report("2.4b: active thread is task-*", is_task,
           f"Active thread: {at!r}")

    # ── 2.5: /main switches back ──
    print("\n--- Test 2.5: /main ---")
    r = await dispatch_command(command="/main", workspace_id=WS, channel_origin="telegram_personal")
    is_main = "main thread" in (r or "")
    report("2.5a: /main returns main thread message", is_main,
           f"Reply: {r!r}")

    at = await get_active_thread(WS, "telegram_personal")
    report("2.5b: active thread reset to sage-main", at == "sage-main",
           f"Active thread: {at!r}")

    # ── 2.2: /compact (structural — won't compact short thread) ──
    print("\n--- Test 2.2: /compact ---")
    r = await dispatch_command(command="/compact", workspace_id=WS, channel_origin="web")
    is_compact_ok = r in (SAGE_COMPACTED, SAGE_COMPACT_NOT_NEEDED)
    report("2.2: /compact returns valid status", is_compact_ok,
           f"Reply: {r!r}")

    # ── Summary ──
    print("\n=== Suite 2 Summary ===")
    passed = sum(1 for _, s, _ in RESULTS if s == "PASS")
    failed = sum(1 for _, s, _ in RESULTS if s == "FAIL")
    print(f"{passed} passed, {failed} failed")

asyncio.run(main())
