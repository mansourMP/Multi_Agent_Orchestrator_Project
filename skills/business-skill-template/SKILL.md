---
name: business-skill-template
description: Template for a workspace-local business skill backed by a handler or custom adapter.
enabled: false
skill_class: specialist_local
permission_label: Workspace-local business workflow
execution_mode: live
action_class: read
connector_scopes: []
trigger_terms: []
allowed_runtime_modes:
  - hosted_secure
  - local_secure
  - privileged_device
requires_approval: false
execution_adapter: handler
---

# Business Skill Template

Use this template when a workspace needs a business-specific skill without changing core dispatch.

## How to wire it

1. Keep this folder disabled until the workspace config is ready.
2. Add a `handler.py` that reads JSON from stdin and returns a JSON result.
3. Add trigger terms only when you want automatic routing.
4. Keep the skill scoped to one workspace unless the workflow is truly reusable.
