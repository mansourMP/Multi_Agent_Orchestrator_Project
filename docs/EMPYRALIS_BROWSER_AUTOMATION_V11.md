# Empyralis Browser Automation V11

## Scope
Browser Automation V11 adds stronger authenticated-browser controls on the existing local browser automation path.

This stays on the same system:
- Workbench configures the browser step
- runtime serializes it through `local-execution-v1`
- runtime precheck derives a browser security profile
- guarded/strict policy can require approval before execution
- the local worker executes it through the Electron browser helper
- runs, approvals, artifacts, and inspect keep the results visible

## Security profiles
V11 classifies browser runs into one of four profiles:
- `public_readonly`
- `public_interactive`
- `authenticated_readonly`
- `authenticated_interactive`

Inputs used to derive the profile:
- `session_profile`
- ordered `browser_actions`
- whether those actions are interactive or privileged

## Approval behavior
In guarded or stricter trust modes:
- `authenticated_interactive` browser runs require approval before local execution starts

The current rule does **not** escalate:
- public read-only flows
- public interactive flows
- authenticated read-only flows

## Inspect visibility
Run Inspect now surfaces browser security state on local execution steps when present:
- `Session profile`
- `Browser profile`

This keeps browser-session trust visible in the same step list as the rest of local execution.

## Validation
Covered by smoke matrix case:
- `A18 authenticated browser approval`

Expected behavior:
1. precheck reports one approval-required tool
2. start response is `waiting_for_input`
3. approval resolution enqueues the run
4. completed browser step reports `browser_security_profile=authenticated_interactive`

## Limits
- approval policy is still profile-based, not domain-based
- session-backed interactive flows are gated, but domain allow/deny lists are not implemented yet
- per-site authenticated risk levels are not yet distinguished

## Next
Browser Automation V12 should focus on:
1. popup/download combinations with approvals
2. domain-aware authenticated controls
3. stronger session-profile governance
