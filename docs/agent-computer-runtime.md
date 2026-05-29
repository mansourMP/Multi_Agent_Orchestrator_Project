# Agent Computer Runtime

Last verified: 2026-05-29
Status: Launch-slice runtime contract; native hardware phases 1-6 implemented

Agent Computer is the user-facing name for an explicitly selected machine where
Sage, and later native Studio agents, can run local work. The platform remains
the brain and control plane. Agent Computer is the side runtime for local files,
browser work, terminal work, desktop apps, personal channels, and dedicated
machine execution.

## Product Boundary

- Cloud remains the default runtime for normal chat.
- Sage must explicitly select an Agent Computer before local execution.
- Studio agents require explicit runtime binding; they do not inherit Sage's
  Agent Computer access.
- Connected external agents do not receive native Agent Computer execution in
  this launch slice. They may show connector requirements or status only.
- `empyralis-gateway` and `empyralis-supervisor` remain internal component
  names. Normal UI should say `Agent Computer`.

## Access Modes

| Mode | Behavior |
| --- | --- |
| Default Guarded | Low-risk local work may run. Risky file, terminal, browser, external-send, install, payment, deploy, credential, and system actions require approval. |
| Autonomous Full Access | Allowed actions on an explicitly selected healthy Agent Computer can run without per-action Empyralis prompts. Revoke, stop, quota, audit, OS permissions, and blocked-action rules still apply. |
| Custom | Visible normal mode. It remains approval-gated until the owner saves a valid policy. |

Custom policy is stored through the existing Agent Computer policy shape and
starts with:

- allowed folders
- blocked folders
- terminal policy
- network/domain policy
- browser/app access
- approval memory duration
- max runtime/budget
- emergency stop behavior

Invalid or missing Custom policy must resolve to guarded approval behavior.

## Local Install Commands

The launch-slice installer keeps the public product name while building the
internal TypeScript edge and Rust local runner.

```bash
scripts/agent_computer.sh install
scripts/agent_computer.sh start
scripts/agent_computer.sh status
scripts/agent_computer.sh stop
```

First pairing can be passed in through the environment:

```bash
EMPYRALIS_GATEWAY_PAIRING_TOKEN=... scripts/agent_computer.sh start
```

On macOS, auto-start can be installed after `install`:

```bash
scripts/agent_computer.sh launchd-install
scripts/agent_computer.sh launchd-uninstall
```

The macOS user LaunchAgent runs a foreground `launchd-run` loop so the desktop
runtime remains a user-session process with launchd restart ownership.

Server/VPS service mode is explicit and not the default desktop path:

```bash
scripts/agent_computer.sh service-install --system
scripts/agent_computer.sh service-status
scripts/agent_computer.sh service-uninstall --system
```

On Linux this installs a systemd service. On macOS the system LaunchDaemon path
requires `--server-mac`; desktop Macs should use the user-session
`launchd-install` command until the user-session bridge is implemented.

The script stores local runtime config in `.orion-stack/agent-computer` and logs
in `.orion-stack/logs`.

## Desktop Permission Readiness

Agent Computer reports desktop permission state in heartbeat metadata. These
states affect execution readiness, not passive service detection.

Permission environment variables:

```bash
EMPYRALIS_AGENT_COMPUTER_PERMISSION_SCREEN_RECORDING=granted
EMPYRALIS_AGENT_COMPUTER_PERMISSION_ACCESSIBILITY=granted
EMPYRALIS_AGENT_COMPUTER_PERMISSION_CLIPBOARD=granted
EMPYRALIS_AGENT_COMPUTER_PERMISSION_AUTOMATION=granted
EMPYRALIS_AGENT_COMPUTER_PERMISSION_BROWSER=granted
```

Allowed states are `granted`, `promptable`, `denied`, `restricted`, and
`unknown`. Any non-`granted` state blocks the matching desktop capability from
readiness and direct execution.

System service mode without a ready user-session bridge treats desktop
capabilities as restricted. Default desktop user-session mode preserves current
behavior when no explicit permission state is reported.

Screenshot capture honors policy retention. When `screenshot_retention=off`,
gateway responses strip inline image bytes and do not create retained screenshot
artifacts.

## Runtime Components

| Internal component | Role |
| --- | --- |
| Cloud control plane | Identity, pairing, policy, approvals, audit, quota, revocation. |
| TypeScript local edge | Persistent outbound connection, local journal, personal-channel ownership, routing to the local runner. |
| Rust local runner | Narrow local capability executor for device actions. |

Do not move local device capability execution into Python for this launch slice.
Future Go/Rust rewrites should target runtime or edge pieces after launch
pressure is lower, not the current Python control plane.
