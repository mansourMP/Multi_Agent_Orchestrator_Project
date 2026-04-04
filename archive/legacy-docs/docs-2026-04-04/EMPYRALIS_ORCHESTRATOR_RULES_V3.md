# Empyralis Orchestrator Rules V3

## Scope
V3 hardens orchestrator delegation after child runs are created.

It adds:
- parent delegation summary refresh when child runs enter terminal states
- retry lineage fields on delegated child runs
- retry endpoint for failed child runs
- UI visibility for orchestration next action and retry
- smoke coverage for failed-child summary and retry

## Runtime behavior
When a delegated child run reaches a terminal state, the parent orchestrator run refreshes:
- `delegation_summary_cache`
- `delegation_next_action`
- `delegation_ready`
- `result_data.orchestration`

## Retry lineage
Retried child runs carry:
- `retry_of_run_id`
- `retry_root_run_id`
- `retry_sequence`

Only the latest child in a retry lineage counts toward the effective orchestration summary.

## Delegation summary additions
The summary now exposes:
- `effective_children`
- `next_action`
- `failed_run_ids`
- `retryable_failed_children`
- `ready_for_merge`

`next_action` values:
- `waiting_for_children`
- `resolve_child_approvals`
- `retry_failed_children`
- `merge_results`

## API
### Retry failed child runs
`POST /runs/{run_id}/delegate/retry-failed`

Body:
```json
{
  "note": "optional retry note",
  "failed_run_ids": ["optional-specific-failed-child-id"]
}
```

## UI
Run Inspect shows:
- orchestration next action
- retry counts
- retry button when failed child runs are retryable
- retry markers on child runs

## Smoke coverage
New checks:
- `A21 orchestrator failed-child summary`
- `A22 orchestrator retry failed child`
