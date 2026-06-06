# Documentation Fill Prompt For Other Agents

Status: Active prompt
Owner: Platform
Last verified: 2026-06-06

Use this prompt when filling any scaffolded domain document.

## Prompt

You are filling an Empyralis documentation file. Do not invent architecture.
Read the listed source files first, then write only facts that are true in the
current repository or explicitly marked as decisions in `docs/decisions/` or
`docs/decisions/architectural-decisions.md`.

Required behavior:

1. Start with a short factual summary.
2. List source-of-truth code files.
3. Describe allowed responsibilities.
4. Describe forbidden responsibilities.
5. Describe security and data boundaries.
6. List tests that protect the contract.
7. Mark gaps as `Migration debt`, not as implemented behavior.
8. Do not delete or overwrite existing docs unless requested.

Use this header:

```md
# Title

Status: Active | Draft | Scaffold | Deprecated
Owner: Platform
Last verified: YYYY-MM-DD
Source of truth: code | decision | runbook | report
Related code:
- path/to/file
Related docs:
- path/to/doc.md
```

## Output Rule

If code and existing docs disagree, write:

```md
Migration debt: Existing docs claim X, but current code does Y.
```

Do not silently make the docs match the desired future.
