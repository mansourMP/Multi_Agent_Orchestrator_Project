---
name: inventory-tool
description: Agent can check live workspace inventory for stock, fitment, availability, and pricing.
enabled: true
skill_class: business
permission_label: Inventory scope
execution_mode: live
action_class: read
connector_scopes:
  - inventory
trigger_terms:
  - inventory
  - stock
  - availability
  - fitment
  - sku
  - part
  - parts
  - wiper
  - brake
  - rotor
  - filter
  - tesla
  - toyota
  - model 3
  - eta
  - delivery
allowed_runtime_modes:
  - hosted_secure
  - local_secure
  - privileged_device
requires_approval: false
execution_adapter: inventory
---

# Inventory Tool

Use the workspace inventory as the source of truth for stock, fitment, and price.

## Rules

- Never invent inventory, fitment, or price.
- If no match is found, say that directly.
- Keep the reply grounded in the returned inventory rows.
