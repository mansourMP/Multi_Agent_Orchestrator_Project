---
name: web-search
description: Agent can search the web using the web_search tool. Use when the user asks about current events or facts.
enabled: true
skill_class: system
permission_label: Public web
execution_mode: live
action_class: read
connector_scopes:
  - web
trigger_terms:
  - latest
  - research
  - search
  - find online
  - web
  - source
  - look up
  - compare
allowed_runtime_modes:
  - hosted_secure
  - local_secure
  - privileged_device
requires_approval: false
execution_adapter: web_search
---

# Web Search

Use `web__search` to find current information and `web__fetch` to inspect the most relevant page.

## Rules

- Prefer `web__search` first for current facts and recent events.
- Use `web__fetch` only when a result needs deeper reading.
- Cite the source URL in the answer when the result matters.
