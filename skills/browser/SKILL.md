---
name: browser
description: Agent can open a page in the browser runtime, inspect the current page, and return the live state.
enabled: true
skill_class: system
permission_label: Browser runtime
execution_mode: live
action_class: read
connector_scopes:
  - browser
trigger_terms:
  - browser
  - browse
  - open site
  - open website
  - navigate
  - inspect page
  - open http
  - open https
allowed_runtime_modes:
  - hosted_secure
  - local_secure
  - privileged_device
requires_approval: false
execution_adapter: browser
---

# Browser

Use the browser runtime to open a page, observe the current state, and return a grounded summary.

## Rules

- Prefer an explicit URL when the user provides one.
- If the goal is vague, resolve it to a search URL instead of inventing a destination.
- Return the observed page title, current URL, and a short grounded preview.
