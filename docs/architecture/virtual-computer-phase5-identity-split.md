# Virtual Computer Phase VC-5 Identity Split

Status: active contract for VC-5.

## Goal

Virtual computer sessions must not inherit a user's local machine identity by accident.

## Identity Classes

Implemented identity classes:

- `user_local_identity`
- `agent_virtual_identity`
- `business_workspace_identity`
- `ephemeral_task_identity`

## Login State Model

Virtual login state is explicit per session:

- `user_interactive_login`
- `credential_broker_grant`
- `unauthenticated`

Default behavior:

- Local runtime defaults to `user_local_identity` + `user_interactive_login`
- Virtual runtime defaults to `agent_virtual_identity` + `unauthenticated`

## Hard Guards

Enforced in `server_modules/virtual_computer_runtime.py`:

- No local browser cookie/session reuse in virtual runtime by default
- `existing_session_attach` blocked for virtual sessions
- `reuse_local_cookies` blocked for virtual sessions
- Credential-broker login requires `credential_grant_id`

## Session Evidence

Runtime responses now include:

- `identity_context.identity_class`
- `identity_context.login_state`
- `identity_context.cookie_reuse_allowed`
- `identity_context.credential_grant_id`
- `identity_context.principal_id`
