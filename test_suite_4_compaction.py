#!/usr/bin/env python3
"""Test Suite 4 — Auto-compaction (pure function + structural tests)"""
import sys, os
sys.path.insert(0, 'server_modules')

RESULTS = []

def report(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    RESULTS.append((name, status, detail))
    print(f"  [{status}] {name}")
    if detail and not passed:
        print(f"         {detail}")

# ── 4.4: is_context_overflow_error ──
print("\n--- Test 4.4: is_context_overflow_error ---")
from compaction_service import is_context_overflow_error

report("4.4a: context_length_exceeded",
       is_context_overflow_error("context_length_exceeded") is True)

report("4.4b: request_too_large",
       is_context_overflow_error("request_too_large") is True)

report("4.4c: maximum context length",
       is_context_overflow_error("maximum context length exceeded") is True)

report("4.4d: network timeout (should be False)",
       is_context_overflow_error("network timeout") is False)

report("4.4e: random error (should be False)",
       is_context_overflow_error("something went wrong") is False)

# ── 4.1: should_compact with short thread ──
print("\n--- Test 4.1: should_compact (short thread) ---")
from compaction_service import should_compact, estimate_turns_tokens

short_turns = [
    {"role": "user", "content": "hello"},
    {"role": "assistant", "content": "hi there"},
    {"role": "user", "content": "how are you"},
    {"role": "assistant", "content": "good thanks"},
]
result_short = should_compact(short_turns, context_window=128000)
token_count = estimate_turns_tokens(short_turns)
report("4.1: should_compact False for short thread", result_short is False,
       f"Token count: {token_count}, threshold ~111616")

# ── 4.2: should_compact with long thread ──
print("\n--- Test 4.2: should_compact (long thread) ---")
lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. " * 8
long_turns = []
for i in range(400):
    long_turns.append({"role": "user", "content": f"message {i}: {lorem}"})
    long_turns.append({"role": "assistant", "content": f"reply {i}: understood, processing {lorem}"})

total_tokens = estimate_turns_tokens(long_turns)
result_long = should_compact(long_turns, context_window=128000)
report("4.2: should_compact True for long thread", result_long is True,
       f"Token count: {total_tokens}, threshold ~111616")

# ── 4.3: compact_turns structural check ──
print("\n--- Test 4.3: compact_turns (structural) ---")
from compaction_service import compact_turns, find_cut_point, serialize_turns_for_compaction, load_previous_summary, DEFAULT_CONTEXT_WINDOW, COMPACTION_RESERVE_TOKENS

report("4.3a: COMPACTION_RESERVE_TOKENS defined",
       isinstance(COMPACTION_RESERVE_TOKENS, int) and COMPACTION_RESERVE_TOKENS > 0,
       f"Value: {COMPACTION_RESERVE_TOKENS}")

report("4.3b: DEFAULT_CONTEXT_WINDOW defined",
       isinstance(DEFAULT_CONTEXT_WINDOW, int) and DEFAULT_CONTEXT_WINDOW > 0,
       f"Value: {DEFAULT_CONTEXT_WINDOW}")

# Test find_cut_point
cut = find_cut_point(long_turns)
report("4.3c: find_cut_point returns positive index", cut > 0,
       f"Cut point: {cut} / {len(long_turns)} turns")

# Test serialize
serialized = serialize_turns_for_compaction(long_turns[:10])
report("4.3d: serialize_turns_for_compaction returns string", isinstance(serialized, str) and len(serialized) > 0,
       f"Length: {len(serialized)}")

# ── Summary ──
print("\n=== Suite 4 Summary ===")
passed = sum(1 for _, s, _ in RESULTS if s == "PASS")
failed = sum(1 for _, s, _ in RESULTS if s == "FAIL")
print(f"{passed} passed, {failed} failed")
