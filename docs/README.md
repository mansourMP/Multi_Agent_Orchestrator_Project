# Empyralis Documentation Map

Status: Active index
Owner: Platform
Last verified: 2026-06-06
Source of truth: Repository code plus active product decisions

This directory is organized so agents can work on the platform without guessing.
Do not delete, rewrite, or move existing documents without first checking git
status and reading the target document.

The root of `docs/` must stay small. Only this index and
`_agent-doc-fill-prompt.md` should live directly in the root. Put every other
document in the folder that owns it.

## Folder Contract

- `platform/`: product-wide platform facts and navigation contracts.
- `security/`: unified platform security model, trust boundaries, and launch
  security checklist.
- `decisions/`: durable architectural decisions and reversals.
- `domains/`: factual docs owned by each platform domain.
- `operations/`: production runbooks, incident response, secret rotation.
- `reports/`: one-time audits, implementation reports, and certification notes.
- `archive/`: stale or superseded documents kept for history only.
- `references/`: images, external references, and research assets.

## Current Migration Rule

Flat root documents were migrated on 2026-06-06. New documentation must go into
the folder that owns the domain.

When a document is migrated:

1. Preserve the original content or link to it.
2. Mark the old file as migrated, or move it to `archive/` in the same change.
3. Update this index.
4. Do not leave active documents in the root.

## Agent Rule

Facts must be grounded in code, tests, existing docs, or verified runtime
behavior. Opinions and product choices belong in `decisions/`, not in factual
domain contracts.
