# Empyralis Skill System V2

## Scope
- Keep the existing `/skills/state` runtime contract
- Add manifest metadata to installed skills
- Add per-skill `policy_mode`
- Expose a small runtime registry summary
- Surface enforcement state in Run Inspect

## Manifest fields
- `id`
- `title`
- `intent`
- `tools`
- `guardrail`
- `runtime_tools`
- `preferred_target`
- `preferred_trust_mode`
- `policy_mode`: `off | warn | enforce`
- `version`
- `author`
- `category`

## Runtime behavior
- The runtime still builds one `skill_contract` per run.
- `policy_mode` resolution:
  1. explicit `metadata.skill_policy_mode` if valid
  2. otherwise any installed skill with `enforce`
  3. otherwise any installed skill with `warn`
  4. otherwise `off`
- If `policy_mode` resolves to `enforce`, undeclared runtime tools are blocked.

## Runtime registry
`GET /skills/state` now exposes registry counts in `state.registry`:
- `builtin_count`
- `custom_count`
- `installed_count`
- `assistant_bundle_count`
- `automation_bundle_count`

## UI
- Skills page now shows:
  - installed/custom/bound counts
  - per-skill policy mode
  - manifest metadata such as category/version
- Run Inspect now shows:
  - skill policy mode
  - declared runtime tools
  - undeclared tool mismatches

## Intent
V2 makes skills a real runtime contract rather than a frontend-only convenience layer.
