---
name: vision-monitor
description: Monitor one or more physical spaces from camera snapshots, write structured current state files, and answer operational questions from those files. Use when Empyralis needs camera snapshots, occupancy counts, scene summaries, or Telegram answers backed by the latest monitored space state.
---

# Vision Monitor

This skill is deployment-local. Keep it enabled only where camera monitoring is configured.

## What this skill owns

- Capture one snapshot from a webcam, RTSP stream, HTTP snapshot endpoint, or local file.
- Run RT-DETRv2 people detection on the snapshot.
- Call the model router for a 5-line scene summary.
- Write `/spaces/<space_id>/current_state.json` and append history.
- Answer Telegram or chat questions from the latest state file without changing the core platform.

## Files

- `config.yaml` — deployment config and enable/disable flag.
- `snapshot.py` — capture one frame.
- `analyze.py` — detector + VLM summary generation.
- `state_writer.py` — current state + history persistence.
- `query_handler.py` — answers natural-language questions from the latest state file.
- `model_router.py` — cloud/local vision model routing.
- `worker.py` — loop every `interval_seconds` or run once for testing.

## Operating rules

- Counts come from the detector first. Do not guess counts from language models.
- Summaries must stay grounded in the structured detector output and latest state.
- If no model endpoint is available, return a clear routing error. The worker may still write deterministic fallback summary lines.
- If no current state file exists yet, say that directly instead of fabricating an answer.

## Minimal demo path

1. Edit `config.yaml` for one camera and one space.
2. Run `python3 skills/vision-monitor/worker.py --once`.
3. Confirm `/spaces/<space_id>/current_state.json` exists.
4. Ask Telegram: `Is the pool open?` or `How many people are there?`
5. `query_handler.py` answers from the state file or provides prompt context to the assistant.
