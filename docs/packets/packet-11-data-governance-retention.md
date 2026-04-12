stage 11 


**Findings**

- `P1` Durable truth is structurally split across at least six active stores: control-plane Postgres schema in [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L38), runtime Postgres schema in [run_state_schema.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_schema.sql#L1), auth SQLite in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L607), runtime SQLite in [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L51), JSON side stores in [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L392), and artifact/vault files in [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L93) and [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L540).
- `P1` Session truth is triplicated. One runtime session is persisted in runtime Postgres, mirrored into runtime SQLite, and mirrored again into control-plane sessions/threads; reads prefer Postgres but fall back to SQLite. Evidence: [session_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/session_service.py#L209), [session_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/session_service.py#L277), [session_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/session_service.py#L301).
- `P1` Governance-grade audit truth is not singular or immutable. `activity_ledger_events` is mutable via `ON CONFLICT DO UPDATE` in [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L2535), runtime channel events are a replaceable SQLite/JSON/in-memory mirror in [runtime_events.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_events.py#L103) and [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L1203), and notifications are merged mutable projections in [notification_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/notification_service.py#L405) and [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L1363).
- `P1` Schema and migration truth are fragmented. Only three repo migrations exist in `/migrations`, while large schemas are still created and altered inline in [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L38), [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L613), [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L55), and [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L1213). I did not find a first-party migration runner or migration ledger in the audited repo search.
- `P1` Activity-ledger governance is weaker than the rest of the control-plane. The table is created in [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L542), but the audited RLS migration file ends at `security_control_events` in [enable_rls.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/migrations/enable_rls.sql#L264); I did not find a matching `activity_ledger_events` policy in that migration.
- `P2` Retention is mostly weak, partial, or fake. Artifact retention is explicitly `placeholder` metadata in [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L33) and [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L162); memory expiry is read-time filtering in [memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py#L965) and [memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py#L1046); activity retention is history-window filtering in [activity_ledger_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/activity_ledger_service.py#L131) and [activity_ledger_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/activity_ledger_service.py#L415); archived runs have no TTL field in [run_state_schema.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_schema.sql#L95).
- `P1` Enterprise/legal governance controls are absent or unproven. I found narrow utilities for deleting one memory key in [runtime_route_registry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registry_service.py#L153), deleting one workspace file request in [agent_workspace_api.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/agent_workspace_api.py#L2181), and exporting/importing the credential vault in [connectors_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors_core.py#L517) and [connectors_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors_core.py#L567). I did not find a first-class tenant/workspace delete flow, legal-hold implementation, or unified backup/restore system in the audited repo search. The docs still mark retention work incomplete in [pending-tasks.md](/Users/mansur/Multi_Agent_Orchestrator_Project/docs/pending-tasks.md#L164).

**Durable Truth Map**

- `Control-plane Postgres`: tenants, users, identities, workspaces, memberships, threads, sessions, turns, inventory, channel/security/egress events, activity ledger in [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L38).
- `Runtime Postgres`: live runs, transitions, approvals, archive, runtime sessions, worker claims, fleet workers, queue partitions in [run_state_schema.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_schema.sql#L1), plus runtime outbox in [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L1213).
- `Auth SQLite`: users, memberships, workspace registry/policies, enterprise settings, auth sessions, refresh tokens, devices, provider connections in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L607).
- `Runtime SQLite`: live runs, local queue/claims, runtime registrations, run history, channel events, chat stream state, runtime sessions/turns, notifications in [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L51).
- `JSON/state files`: run history, channel events, dead letters, approval audit, schedules, webhooks, setup sessions, provider profiles, tool/app/runtime state, diagnostics, idempotency in [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L392).
- `Filesystem/object storage`: artifact blobs and JSON sidecar records in [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L93) and [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L368).
- `Credential vault`: encrypted credential file and key file in [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L540), [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L567), and [vault_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/vault_store.py#L226).

**Schema And Migration Risk List**

- Only three migration files are present in [migrations](/Users/mansur/Multi_Agent_Orchestrator_Project/migrations), but major schema bootstrapping still happens inside application code.
- Auth and runtime SQLite schemas are integrity-light. The auth DB tables shown in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L613) have no proven foreign keys; runtime SQLite only uses a few local FKs in [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L189), [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L227), and [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L263).
- Runtime Postgres also leaves integrity gaps. `run_approvals` in [run_state_schema.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_schema.sql#L22) has no FK to `live_runs`; `runtime_outbox` is evolved separately in code in [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L1237).
- Control-plane tables mix `CREATE TABLE`, `ALTER TABLE`, and `DO $$` compatibility blocks in one runtime schema string in [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L570) and [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L666), which is migration-by-import, not clean migration discipline.

**Retention / Deletion / Export / Legal-Hold Matrix**

- `Explicit and enforceable`: runtime local prunes and hard deletes in [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L1056), [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L1071), and [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L1245); workspace memory-key deletion in [runtime_route_registry_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_route_registry_service.py#L153); credential-vault export/import in [connectors_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors_core.py#L517) and [connectors_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors_core.py#L567); stale local queued-run cleanup in [local_queue.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/local_queue.py#L2652).
- `Implicit but weak`: artifact retention placeholder metadata in [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L33); memory expiry filter in [memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py#L1046); activity history read-window filtering in [activity_ledger_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/activity_ledger_service.py#L415); capped JSON approval audit rewrite in [runs_history.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_history.py#L152) and [runs_history.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runs_history.py#L244).
- `Absent`: legal hold; general tenant/workspace export; general tenant/workspace deletion; unified backup/restore orchestration. Repo search over `server_modules/`, `docs/`, `planning/`, and `deployment/` did not produce a first-class implementation; the closest hit was a narrow `.bak` script in [telegram_rebind_and_watch.sh](/Users/mansur/Multi_Agent_Orchestrator_Project/scripts/telegram_rebind_and_watch.sh#L265).

**Backup / Restore Truth Table**

- `Control-plane Postgres only`: insufficient. You lose runtime live state, auth SQLite, vault credentials, JSON side state, and artifact blobs.
- `Runtime Postgres only`: insufficient. You lose control-plane identity/membership/thread truth, auth SQLite, vault, JSON state, and artifacts.
- `Local companion restore`: partial. Runtime SQLite, JSON files, vault, and object store can restore local behavior, but not a coherent tenant/workspace picture without control-plane and auth stores.
- `Cloud / enterprise restore`: weak by design today. A faithful restore requires at least control-plane Postgres, runtime Postgres, auth SQLite, runtime SQLite, JSON state files, credential vault/key, and artifact storage. No repo-level proof of a single orchestrated restore path was found.
- `Privacy posture`: cloud has the strongest scope model because of control-plane RLS in [enable_rls.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/migrations/enable_rls.sql#L80); local/self-host can preserve privacy operationally, but only if the operator isolates and backs up every side store, because the repository does not enforce that discipline.

**Sensitive-Data Storage Map**

- `PII / identity`: control-plane users and identities in [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L52) and [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L65); auth SQLite users in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L613).
- `Auth secrets / security records`: password hashes, refresh-token hashes, device/session state, SSO/SCIM settings in [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L618), [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L684), [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L763), [auth.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/auth.py#L805).
- `Provider / connector credentials`: encrypted vault credentials in [vault_helpers.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/vault_helpers.py#L88), stored in the vault file from [vault_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/vault_store.py#L226) and keyed by [runtime_config.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_config.py#L567).
- `Transcripts / sessions / turns`: control-plane threads/sessions/turns in [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L111), [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L125), [control_plane_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/control_plane_repository.py#L139), plus runtime session mirrors in [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L160).
- `Runs / approvals / notifications / channel events`: runtime Postgres in [run_state_schema.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_schema.sql#L1), [run_state_schema.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_schema.sql#L22), [run_state_repository.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_repository.py#L1216); runtime SQLite mirrors in [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L55), [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L123), [runtime_state_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/runtime_state_store.py#L195).
- `Artifacts / attachments`: blob store and JSON sidecar metadata, including absolute file paths, in [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L93) and [artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py#L375).

**Strongest Data-Governance Failures**

- There is no single durable source of truth for a workspace.
- Audit/history surfaces are partly mutable projections, not clean append-only evidence.
- Retention is often presentation-layer filtering or placeholder metadata, not proven deletion.
- Legal hold, tenant/workspace lifecycle deletion, and unified restore are not repository-proven capabilities.

**Confirmed Findings**

- Durable truth is hybrid and split across Postgres, SQLite, JSON files, vault files, and artifact storage.
- Session truth is triplicated.
- `activity_ledger_events` is mutable, and runtime channel/notification trails are mirrored mutable projections.
- Artifact retention is placeholder metadata only.
- Memory/activity “retention” is partly read-time filtering rather than hard deletion.
- The repository proves no unified backup/restore system and no legal-hold system.
- The repository proves only narrow export/delete utilities, not full tenant/workspace governance workflows.

**Unproven Suspicions**

- [run_state_schema.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_schema.sql) may be partially outside the live runtime bootstrap path; repo search found the file but no direct execution reference in audited Python code.
- Some migration or backup orchestration may exist outside this repository or in deployment-only tooling not yet audited.
- There may be an operator process for legal hold/export outside code, but it is not represented in the audited repo.

**Exact Next Files To Inspect**

- [vault_store.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/vault_store.py)
- [connectors_core.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/connectors_core.py)
- [run_state_schema.sql](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/run_state_schema.sql)
- [memory_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/memory_service.py)
- [file_bridge_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/file_bridge_service.py)
- [deployment](/Users/mansur/Multi_Agent_Orchestrator_Project/deployment)

**Verdict**

This audit category does **not** pass today.

The platform is not yet defensible for enterprise/legal data governance. The main blockers are split durable truth, mutable audit surfaces, weak retention enforcement, and the absence of a repository-proven legal-hold and restore model.




