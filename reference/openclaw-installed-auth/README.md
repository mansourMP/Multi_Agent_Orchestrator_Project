# OpenClaw Installed Auth Reference

These files were copied from the locally installed OpenClaw package at:

- `/Users/mansur/.nvm/versions/node/v22.18.0/lib/node_modules/openclaw`

This folder is for reference only. It captures the parts of OpenClaw's shipped auth stack that matter for:

- `Sign in with ChatGPT`
- OpenAI Codex OAuth
- macOS keychain and `~/.codex/auth.json` import
- Codex transport differences vs normal OpenAI API

## Key findings

- OpenClaw models ChatGPT/Codex as a separate provider: `openai-codex`
- Its Codex base URL is `https://chatgpt.com/backend-api`, not `https://api.openai.com/v1`
- The real OAuth implementation is not in OpenClaw's wrapper itself; it lives in the bundled `@mariozechner/pi-ai` dependency
- The shipped OpenAI Codex OAuth client id is:
  - `app_EMoamEEZ73f0CkXaXp7hrann`
- The shipped loopback callback is:
  - `http://localhost:1455/auth/callback`

## OpenClaw wrapper files

- `provider-auth-login.runtime-CMPla3Gu.js`
  - Wraps provider login flows
  - Calls `loginOpenAICodex()` from `@mariozechner/pi-ai/oauth`
  - Adds browser-open handling, loopback/manual fallback, and TLS preflight messaging
- `provider-oauth-flow-DplzeEG9.js`
  - Shared browser/manual OAuth flow helpers
  - Handles local vs remote/VPS prompting
- `provider-openai-codex-oauth-tls-Crv4q_VV.js`
  - TLS preflight for `auth.openai.com`
  - Detects local certificate issues before OAuth starts
- `openai-codex-provider-DOgEIHlR.js`
  - Registers the `openai-codex` provider plugin
  - Uses ChatGPT OAuth
  - Normalizes transport to `openai-codex-responses`
  - Uses Codex usage fetching and OAuth refresh
- `openai-codex-catalog-Dg5eIHyq.js`
  - Defines Codex base URL as `https://chatgpt.com/backend-api`
- `openai-codex-auth-identity-r9QU535f.js`
  - Decodes JWT payloads and derives stable identity/email/profile name
- `profiles-CRvutsjq.js`
  - Reads Codex credentials from macOS keychain first
  - Falls back to `~/.codex/auth.json`
  - Syncs those credentials into OpenClaw's auth store

## Bundled `pi-ai` files

These are copied under `pi-ai/`.

- `pi-ai/oauth.js`
  - Entry re-export for OAuth helpers
- `pi-ai/index.js`
  - OAuth provider registry
- `pi-ai/openai-codex.js`
  - The actual OpenAI Codex OAuth implementation
  - Contains the real client id, PKCE flow, token exchange, refresh, and loopback server on port `1455`
- `pi-ai/oauth-page.js`
  - Success/error HTML shown to the browser during local OAuth callback
- `pi-ai/pkce.js`
  - PKCE challenge/verifier generation
- `pi-ai/openai-codex-responses.js`
  - Codex transport implementation against ChatGPT backend API
- `pi-ai/openai-responses-shared.js`
  - Shared OpenAI-style responses transport helpers

## Why this matters for Empyralis

The main relevant architectural lesson is:

- ChatGPT/Codex OAuth should not be treated like a normal OpenAI API key
- It needs its own auth mode and likely its own provider/transport path
- Reusing local Codex auth from `~/.codex/auth.json` is valid
- But the runtime path should align with ChatGPT/Codex transport expectations, not `/v1/models` or generic OpenAI API assumptions
