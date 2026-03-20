#!/usr/bin/env python3
import argparse
import json
import os
import socket
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from orion_local_worker_content import normalize_content_plan_items
from orion_local_worker_execution import build_local_execution_pack_result
from orion_local_worker_llm import (
    generate_chat_reply_with_provider_fallback,
    generate_pack_with_provider_fallback,
)
from orion_local_worker_runtime import RateLimitError, RuntimeClient
from orion_local_worker_spreadsheets import build_spreadsheet_pack_result
from orion_local_worker_utils import (
    agent_role_prompt_append_from_metadata,
    collapse_duplicate_reply_sections,
    skill_prompt_append_from_metadata,
    split_items,
)
from orion_local_worker_workspace import format_workspace_listing_reply


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def ensure_trailing_slashless(url: str) -> str:
    return (url or "").rstrip("/")


def build_pack_result(run: Dict[str, Any], worker_id: str) -> Tuple[str, Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    metadata = context.get("metadata") if isinstance(context.get("metadata"), dict) else {}
    pack_id = str(metadata.get("outcome_pack") or "").strip()
    goal = str(context.get("user_goal") or "Complete requested task").strip()
    pack_inputs = metadata.get("pack_inputs") if isinstance(metadata.get("pack_inputs"), dict) else {}

    if pack_id == "weekly-content-studio":
        topics = split_items(str(pack_inputs.get("topics") or "General update"))
        channels = split_items(str(pack_inputs.get("channels") or "Instagram"))
        offers = str(pack_inputs.get("offers") or "Learn more").strip() or "Learn more"
        use_llm = str(os.getenv("ORION_LOCAL_WORKER_USE_LLM", "1")).strip().lower() not in {"0", "false", "no", "off"}
        llm_required = str(os.getenv("ORION_LOCAL_WORKER_LLM_REQUIRED", "0")).strip().lower() in {"1", "true", "yes", "on"}
        llm_usage_masked: Optional[Dict[str, Any]] = None
        llm_result: Optional[Dict[str, Any]] = None
        attempted_providers = ""
        llm_error = ""
        if use_llm:
            system_prompt = os.getenv(
                "ORION_LOCAL_WORKER_SYSTEM_PROMPT",
                "You are Empyralis Local Worker. Output valid JSON only with keys: summary, content_plan, next_steps. "
                "content_plan must be an array of objects with: day, channel, format, topic, headline, cta, status.",
            )
            user_prompt = (
                f"Business goal: {goal}\n"
                f"Topics: {', '.join(topics or ['General update'])}\n"
                f"Channels: {', '.join(channels or ['Instagram'])}\n"
                f"Offer/CTA: {offers}\n"
                "Create a practical weekly plan (max 7 items) for SMB users."
            )
            llm_result, llm_usage_masked, attempted_providers, llm_error = generate_pack_with_provider_fallback(
                context,
                metadata,
                system_prompt,
                user_prompt,
            )
            if llm_required and not isinstance(llm_result, dict):
                raise RuntimeError(
                    "LLM generation required but unavailable. "
                    f"attempted={attempted_providers or 'none'} error={llm_error or 'unknown'}"
                )

        content_plan = normalize_content_plan_items(
            (llm_result or {}).get("content_plan") if isinstance(llm_result, dict) else None,
            topics,
            channels,
            offers,
        )
        summary = f"Local worker drafted {len(content_plan)} weekly content items for {', '.join(channels[:2] or ['social channels'])}."
        if isinstance(llm_result, dict):
            llm_summary = str(llm_result.get("summary") or "").strip()
            if llm_summary:
                summary = llm_summary
        next_steps = [
            "Review generated headlines and CTAs.",
            "Approve calendar scheduling.",
            "Connect publish tool when ready.",
        ]
        if isinstance(llm_result, dict):
            llm_steps = llm_result.get("next_steps")
            if isinstance(llm_steps, list):
                normalized_steps = [str(item).strip() for item in llm_steps if str(item).strip()]
                if normalized_steps:
                    next_steps = normalized_steps[:5]
        data = {
            "pack_id": "weekly-content-studio",
            "summary": summary,
            "inputs": {
                "topics_count": len(topics),
                "channels_count": len(channels),
                "offers_count": 1 if offers else 0,
            },
            "outputs": {"content_plan": content_plan},
            "next_steps": next_steps,
        }
        if isinstance(llm_result, dict) and isinstance(llm_usage_masked, dict):
            data["generation"] = {
                "mode": "llm",
                "provider": llm_usage_masked.get("provider"),
                "model": llm_usage_masked.get("model"),
                "attempted_providers": attempted_providers,
            }
        else:
            data["generation"] = {
                "mode": "deterministic_fallback",
                "provider": "local_companion",
                "model": "local-worker-v0",
                "attempted_providers": attempted_providers,
                "error": llm_error or "llm disabled or unavailable",
            }
        return summary, data, llm_usage_masked

    if pack_id == "customer-ops-autopilot":
        inbox_items = split_items(str(pack_inputs.get("inbox") or ""))
        leads = split_items(str(pack_inputs.get("leads") or ""))
        slots = split_items(str(pack_inputs.get("slots") or ""))

        if not leads and inbox_items:
            leads = [f"Contact {idx + 1}" for idx, _ in enumerate(inbox_items[:3])]

        if not inbox_items and not leads:
            summary = "Client Workflow Autopilot needs inbox or lead inputs before execution."
            data = {
                "pack_id": "customer-ops-autopilot",
                "summary": summary,
                "inputs": {
                    "inbox_count": 0,
                    "lead_count": 0,
                    "slot_count": len(slots),
                },
                "outputs": {
                    "urgent_count": 0,
                    "outbound_actions": 0,
                    "triage": [],
                    "follow_ups": [],
                    "bookings": [],
                },
                "connector": {
                    "enabled": False,
                    "gmail_drafts_created": 0,
                    "calendar_events_created": 0,
                    "warnings": ["Connector not attached in local worker v0."],
                },
                "next_steps": [
                    "Add inbox messages or lead list.",
                    "Optionally add booking slots.",
                    "Run again to generate follow-ups and booking proposals.",
                ],
            }
            return summary, data, None

        triage = [
            {
                "id": "triage-1",
                "lead_name": leads[0] if leads else "Lead A",
                "message": "Prioritized for response",
                "priority": "high",
                "status": "triaged",
            }
        ]
        follow_ups = [
            {
                "id": "followup-1",
                "lead_name": leads[0] if leads else "Lead A",
                "draft_message": "Thanks for your interest. Here is our recommended next step.",
                "status": "drafted",
            }
        ]
        bookings = []
        if slots:
            bookings = [
                {
                    "id": "booking-1",
                    "lead_name": leads[0] if leads else "Lead A",
                    "proposed_slot": slots[0],
                    "status": "proposed",
                }
            ]
        summary = f"Local worker triaged inbox and prepared follow-up + booking proposal for {len(leads) or 1} lead(s)."
        data = {
            "pack_id": "customer-ops-autopilot",
            "summary": summary,
            "inputs": {
                "inbox_count": len(inbox_items),
                "lead_count": len(leads),
                "slot_count": len(slots),
            },
            "outputs": {
                "urgent_count": 1,
                "outbound_actions": len(follow_ups) + len(bookings),
                "triage": triage,
                "follow_ups": follow_ups,
                "bookings": bookings,
            },
            "connector": {
                "enabled": False,
                "gmail_drafts_created": 0,
                "calendar_events_created": 0,
                "warnings": ["Connector not attached in local worker v0."],
            },
            "next_steps": [
                "Approve outbound follow-up draft.",
                "Approve booking slot proposal." if slots else "Add booking slots to generate scheduling proposals.",
                "Connect Gmail/Calendar when ready.",
            ],
        }
        return summary, data, None

    if pack_id == "competitor-brief-digest":
        competitors = split_items(str(pack_inputs.get("competitors") or "Competitor A, Competitor B"))
        objectives = split_items(str(pack_inputs.get("objectives") or "Improve messaging"))
        briefs = []
        for idx, name in enumerate(competitors[:5] or ["Competitor A"]):
            threat = "high" if idx == 0 else "medium"
            briefs.append(
                {
                    "id": f"brief-{idx + 1}",
                    "name": name,
                    "threat_level": threat,
                    "summary": f"{name} is active in your category. Monitor pricing and messaging updates.",
                    "recommended_move": "Differentiate offer and tighten follow-up speed.",
                }
            )
        summary = f"Local worker created competitor brief for {len(briefs)} competitor(s)."
        data = {
            "pack_id": "competitor-brief-digest",
            "summary": summary,
            "inputs": {
                "competitors_count": len(competitors),
                "positioning_count": max(1, len(split_items(str(pack_inputs.get('positioning') or 'positioning')))),
                "objectives_count": len(objectives),
            },
            "outputs": {
                "high_threat_count": len([item for item in briefs if item.get("threat_level") == "high"]),
                "briefs": briefs,
            },
            "next_steps": [
                "Pick top competitor and run deeper teardown.",
                "Map pricing deltas.",
                "Adjust offer messaging for next campaign.",
            ],
        }
        return summary, data, None

    if pack_id == "spreadsheet-ops-v1":
        summary, data = build_spreadsheet_pack_result(pack_inputs)
        return summary, data, None

    if pack_id == "local-execution-v1":
        summary, data = build_local_execution_pack_result(run, metadata, pack_inputs)
        return summary, data, None

    listing_reply = format_workspace_listing_reply(goal)
    if listing_reply is not None:
        return listing_reply

    use_llm = str(os.getenv("ORION_LOCAL_WORKER_USE_LLM", "1")).strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    attempted_providers = ""
    llm_error = ""
    if use_llm:
        system_prompt_base = (
            os.getenv("ORION_LOCAL_WORKER_CHAT_SYSTEM_PROMPT")
            or "You are Empyralis, a direct and practical AI assistant for business owners. "
            "Respond naturally, avoid internal metadata, and keep answers concrete."
        )
        skill_prompt = skill_prompt_append_from_metadata(metadata)
        role_prompt = agent_role_prompt_append_from_metadata(metadata)
        prompt_parts = [system_prompt_base]
        if role_prompt:
            prompt_parts.append(role_prompt)
        if skill_prompt:
            prompt_parts.append(skill_prompt)
        system_prompt = "\n\n".join(part.strip() for part in prompt_parts if str(part).strip())
        reply, usage_masked, attempted_providers, llm_error = generate_chat_reply_with_provider_fallback(
            context=context,
            metadata=metadata,
            user_goal=goal,
            system_prompt=system_prompt,
        )
        if reply:
            cleaned_reply = collapse_duplicate_reply_sections(reply)
            data = {
                "generated_by": "empyralis_local_worker_llm_v1",
                "worker_id": worker_id,
                "goal": goal,
                "reply": cleaned_reply,
                "completed_at": utc_now_iso(),
                "generation": {
                    "mode": "llm_chat",
                    "attempted_providers": attempted_providers,
                },
                "skills": {
                    "scope": str(metadata.get("skill_scope") or "").strip() or None,
                    "skill_ids": (
                        list((metadata.get("skill_bundle") or {}).get("skill_ids"))
                        if isinstance(metadata.get("skill_bundle"), dict) and isinstance((metadata.get("skill_bundle") or {}).get("skill_ids"), list)
                        else []
                    ),
                },
            }
            return cleaned_reply, data, usage_masked

    goal_lower = goal.strip().lower()
    if "api.responses.write" in (llm_error or "").lower() or "missing scopes" in (llm_error or "").lower():
        summary = "I got your message, but AI auth is missing required scope (`api.responses.write`). Reconnect Codex auth, then try again."
    elif "insufficient_quota" in (llm_error or "").lower() or "exceeded your current quota" in (llm_error or "").lower():
        summary = "I got your message, but the connected AI account has quota/billing limits. Reconnect or change provider."
    elif "no provider credentials available" in (llm_error or "").lower() or "missing_api_key" in (llm_error or "").lower():
        summary = "I got your message, but no Codex/OpenAI credential is active. Run codex login (or add token) and retry."
    elif goal_lower in {"hi", "hello", "hey", "yo", "sup", "/start", "start"}:
        summary = "Hey, I’m online. Tell me exactly what you want done and I’ll execute it."
    else:
        summary = f"I got this: “{goal}”. I’m in local fallback mode right now."
    fallback = {
        "generated_by": "empyralis_local_worker_v0",
        "worker_id": worker_id,
        "goal": goal,
        "completed_at": utc_now_iso(),
        "generation": {
            "mode": "deterministic_fallback",
            "attempted_providers": attempted_providers,
            "error": llm_error or "llm unavailable for general chat goal",
        },
    }
    return summary, fallback, None


def process_run(client: RuntimeClient, worker_id: str, run: Dict[str, Any], step_delay_seconds: float, verbose: bool = True):
    run_id = str(run.get("run_id") or "").strip()
    if not run_id:
        raise RuntimeError("Claimed run payload missing run_id.")

    phases = [
        "Local worker accepted task.",
        "Preparing local output.",
        "Finalizing result payload.",
    ]
    for phase in phases:
        if verbose:
            print(f"[{run_id[:8]}] {phase}")
        client.heartbeat_worker(worker_id, run_id, phase)
        client.heartbeat_run(run_id, worker_id, phase)
        if step_delay_seconds > 0:
            time.sleep(step_delay_seconds)

    summary, result_data, usage_override = build_pack_result(run, worker_id)
    usage = {
        "provider": "local_companion",
        "model": "local-worker-v0",
        "input_tokens_est": 0,
        "output_tokens_est": 0,
        "total_tokens_est": 0,
        "cost_est_usd": 0.0,
        "cost_band": "$0.00",
    }
    if isinstance(usage_override, dict):
        usage = usage_override
    client.complete_run(run_id, worker_id, summary, result_data=result_data, usage_masked=usage)
    if verbose:
        print(f"[{run_id[:8]}] Completed.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Empyralis Local Worker v0")
    parser.add_argument("--runtime-url", default="http://127.0.0.1:8001", help="Empyralis runtime base URL")
    parser.add_argument("--api-key", default="", help="Runtime API key (or set ORION_API_KEY/RUNTIME_KEY)")
    parser.add_argument("--worker-id", default="", help="Stable worker ID")
    parser.add_argument("--poll-seconds", type=float, default=2.0, help="Claim polling interval")
    parser.add_argument("--idle-heartbeat-seconds", type=float, default=10.0, help="Idle heartbeat interval")
    parser.add_argument("--step-delay-seconds", type=float, default=1.0, help="Delay between simulated run steps")
    parser.add_argument("--once", action="store_true", help="Process at most one run then exit")
    parser.add_argument("--max-wait-seconds", type=float, default=120.0, help="When --once is used, stop after this wait if no run is claimed")
    parser.add_argument("--quiet", action="store_true", help="Minimize logs")
    args = parser.parse_args()

    api_key = (args.api_key or "").strip()
    if not api_key:
        api_key = (
            os.getenv("ORION_API_KEY")
            or os.getenv("RUNTIME_KEY")
            or os.getenv("CREW_API_KEY")
            or ""
        ).strip()
    if not api_key:
        print("Missing runtime API key. Use --api-key or export ORION_API_KEY.", file=sys.stderr)
        return 2

    worker_id = (args.worker_id or "").strip()
    if not worker_id:
        host = socket.gethostname().split(".")[0]
        worker_id = f"empyralis-local-{host}-{uuid.uuid4().hex[:6]}"

    client = RuntimeClient(base_url=args.runtime_url, api_key=api_key)
    verbose = not args.quiet

    if verbose:
        print(f"Empyralis Local Worker v0")
        print(f"Runtime: {ensure_trailing_slashless(args.runtime_url)}")
        print(f"Worker:  {worker_id}")

    deadline = time.time() + max(5.0, args.max_wait_seconds)
    next_idle_heartbeat_at = 0.0
    processed_runs = 0
    consecutive_errors = 0

    while True:
        now = time.time()
        if now >= next_idle_heartbeat_at:
            try:
                client.heartbeat_worker(worker_id, None, "idle")
                consecutive_errors = 0
            except RateLimitError as exc:
                if verbose:
                    print(f"[warn] Worker heartbeat rate-limited, retry in {exc.retry_after_seconds}s")
                next_idle_heartbeat_at = time.time() + exc.retry_after_seconds
                time.sleep(exc.retry_after_seconds)
                continue
            except Exception as exc:
                if verbose:
                    print(f"[warn] Worker heartbeat failed: {exc}")
            next_idle_heartbeat_at = now + max(2.0, args.idle_heartbeat_seconds)

        try:
            claimed = client.claim_run(worker_id)
            run = claimed.get("run") if isinstance(claimed, dict) else None
            if isinstance(run, dict):
                run_id = str(run.get("run_id") or "").strip()
                try:
                    process_run(client, worker_id, run, max(0.0, args.step_delay_seconds), verbose=verbose)
                    processed_runs += 1
                    consecutive_errors = 0
                    if args.once:
                        break
                except Exception as run_exc:
                    message = str(run_exc)[:1000] or "Local worker execution failed."
                    if verbose:
                        print(f"[error] Run failed ({run_id[:8] if run_id else 'unknown'}): {message}")
                    if run_id:
                        try:
                            client.fail_run(run_id, worker_id, message)
                        except Exception as fail_exc:
                            if verbose:
                                print(f"[warn] Could not mark run as failed ({run_id[:8]}): {fail_exc}")
                    consecutive_errors += 1
                    if args.once:
                        return 4
            else:
                if args.once and time.time() > deadline:
                    if verbose:
                        print("No local run was queued before timeout.")
                    return 3
                time.sleep(max(0.2, args.poll_seconds))
        except KeyboardInterrupt:
            if verbose:
                print("Interrupted, shutting down worker.")
            break
        except RateLimitError as exc:
            consecutive_errors += 1
            delay = max(float(exc.retry_after_seconds), max(0.5, args.poll_seconds))
            if verbose:
                print(f"[warn] Worker rate-limited, sleeping {delay:.1f}s before retry.")
            time.sleep(delay)
        except Exception as exc:
            consecutive_errors += 1
            if verbose:
                print(f"[error] Worker loop error: {exc}")
            delay = min(15.0, max(1.0, args.poll_seconds) * (1.0 + (consecutive_errors * 0.35)))
            time.sleep(delay)

    if verbose:
        print(f"Processed runs: {processed_runs}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
