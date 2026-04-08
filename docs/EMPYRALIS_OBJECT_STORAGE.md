# Empyralis Object Storage

Date: 2026-04-08

Empyralis now has one canonical artifact interface with two deployment modes:

- Production: S3-compatible object storage
- Local development fallback: filesystem object storage under `.orion-object-store/`

The runtime-facing interface remains [server_modules/artifact_service.py](/Users/mansur/Multi_Agent_Orchestrator_Project/server_modules/artifact_service.py).
Artifact URIs stay canonical as `artifact://...` regardless of the backing store.

## Production S3-Compatible Backend

Set:

- `EMPYRALIS_OBJECT_STORAGE_BACKEND=s3`
- `EMPYRALIS_OBJECT_STORAGE_BUCKET=<bucket>`

Optional:

- `EMPYRALIS_OBJECT_STORAGE_REGION=<region>`
- `EMPYRALIS_OBJECT_STORAGE_ENDPOINT=<endpoint>`
- `EMPYRALIS_OBJECT_STORAGE_PREFIX=<prefix>`
- `EMPYRALIS_OBJECT_STORAGE_ACCESS_KEY_ID=<access-key>`
- `EMPYRALIS_OBJECT_STORAGE_SECRET_ACCESS_KEY=<secret-key>`
- `EMPYRALIS_OBJECT_STORAGE_SESSION_TOKEN=<session-token>`
- `EMPYRALIS_OBJECT_STORAGE_PATH_STYLE=1`

AWS-standard fallbacks are also honored for region and credentials where appropriate.

## Local Development Fallback

If `EMPYRALIS_OBJECT_STORAGE_BACKEND` is unset or not `s3`, Empyralis uses the filesystem object store:

- records: `.orion-object-store/records/`
- objects: `.orion-object-store/objects/`
- download cache: `.orion-object-store/cache/`

Override roots if needed:

- `EMPYRALIS_OBJECT_STORAGE_ROOT`
- `EMPYRALIS_OBJECT_STORAGE_CACHE_ROOT`

## Compatibility Notes

- Artifact metadata records remain local runtime metadata so the canonical artifact URI can always resolve through the runtime.
- When using S3-compatible storage, `resolve_artifact_content_path()` materializes the artifact into the local cache before the API serves it.
- No caller should need to change from `artifact://...` references to benefit from the production backend.
