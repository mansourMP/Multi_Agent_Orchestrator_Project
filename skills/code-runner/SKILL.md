---
name: code-runner
description: Agent can run Python and shell code, show output, handle errors, and iterate.
enabled: true
required_bins:
  - python3
---

# Code Runner

Use shell and local execution tools to run code, inspect output, and iterate on failures.

## Rules

- Show the relevant output, not noise.
- If a command fails, explain the failure and try the next sensible correction.
- Keep destructive commands approval-gated.
