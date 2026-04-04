# Empyralis Skill System V1

## Goal
Turn skills from prompt-only helpers into runtime contracts.

## What a skill means in V1
A skill can now declare:
- `intent`
- `guardrail`
- `tools` for prompt/context guidance
- `runtime_tools` for real execution expectations
- `preferred_target`
- `preferred_trust_mode`

## Runtime behavior
When a run includes a `skill_bundle`, runtime precheck now computes a `skill_contract`:
- declared runtime tools
- undeclared predicted tools
- preferred execution targets
- preferred trust modes
- mismatch flags

This contract is attached to `tool_policy_precheck`.

## Policy modes
- `off`: ignore skill/runtime mismatch
- `warn`: surface mismatch in inspect/precheck, do not block
- `enforce`: block predicted tools that are not declared by the active skill bundle

Current default for agent-owned runs is `warn`.

## Why this matters
This gives Empyralis a capability layer closer to the large agent products:
- skills are not just prompt text
- skills declare what kind of runtime actions they are supposed to use
- policy can inspect that before execution

## V1 limits
- no per-skill install sandbox yet
- no tool-scoped permission UI yet
- no backend-enforced role-to-skill compatibility matrix yet
- no automatic skill selection engine yet

## Next step
Skill System V2:
1. installable skill manifests
2. per-skill capability permissions
3. agent-template skill packs
4. browser automation skills as first-class runtime capabilities
