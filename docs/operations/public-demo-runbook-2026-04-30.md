# Public Demo Runbook - 2026-04-30

Status: operational runbook for the certified Sage public-demo scope.

This runbook does not expand product scope. It is only for running the demo that was already certified.

## Certified Scope

Allowed in the public demo:

- Login or signup.
- Open Sage.
- Show the clean composer.
- Send a normal chat message.
- Show the inline thinking row and assistant response.
- Open the model/reasoning picker.
- Open the tools palette.
- Show gateway-offline degradation: local tools unavailable, cloud tools available.
- Run web search.
- Optional: show History, Memory, and Integrations.
- Optional: pair gateway and run one harmless local command against a clean demo directory.

Do not demo unless separately certified:

- Video generation.
- Image generation without a verified backend key in the demo workspace.
- Studio specialists as the core flow.
- Mobile app.
- Mini-app layer.
- Purchases, destructive file actions, or external sends.
- Private Desktop or private local filesystem contents.

## Pre-Demo Setup

Run these checks 15-30 minutes before the demo.

1. Confirm production web is up:

```bash
curl -sS -I https://empyralis-web.onrender.com
```

Expected: HTTP `200`.

2. Confirm production runtime is up:

```bash
curl -sS https://empyralis-runtime.onrender.com/health
```

Expected:

```json
{"ok":true}
```

3. Open the live demo account.

- Store the email and password outside git/docs.
- Do not use personal keys visible in browser history or docs.
- Do not paste API keys during the live demo.

4. Confirm one provider is usable.

- Open Sage > Integrations.
- Confirm the active provider row shows a configured provider.
- Preferred demo provider: the provider that was verified immediately before the event.
- If provider setup fails, stop and do not demo chat until the catalog shows a usable provider.

5. Confirm composer state.

- Model/reasoning picker visible.
- Runtime pill visible.
- Tools button visible.
- Textarea says `Message Sage...`.
- Send arrow visible.

6. Confirm gateway state.

- If not demoing local tools, gateway can remain offline.
- If demoing local tools, pair gateway before the demo and verify the pill changes to `This Mac`.
- Use a cleaned demo folder or harmless command only.

## Demo Script

Follow this order exactly.

1. Login or sign up.
2. Open Sage.
3. Point out the composer:
   - model/reasoning picker
   - runtime pill
   - tools button
   - textarea
   - send button
4. Send:

```text
hello
```

Expected:

- user message appears immediately
- input clears immediately
- thinking row appears
- assistant response appears
- no timeout or raw error

5. Open the model/reasoning picker.

Expected:

- provider-backed model options are visible
- reasoning choices are visible

6. Open the tools palette.

Expected with gateway offline:

- local machine tools are unavailable
- web/search/fetch cloud tools remain available

7. Run web-search demo:

```text
Use the web search tool to find the official Ollama homepage URL and return only the URL.
```

Expected:

- thinking row appears
- response includes the official Ollama URL
- no raw error or debug card

8. Optional local-tool demo, only if gateway is paired.

Use a harmless command against a clean demo directory, for example:

```text
Use the local shell tool to list the files in ~/EmpyralisDemo and return the result exactly.
```

Expected:

- runtime pill shows `This Mac`
- local tool call completes
- result contains only safe demo files

9. Optional surfaces:

- History: show flat conversation rows.
- Memory: show sensitivity/count surface.
- Integrations: show active provider row and provider picker.

## Hard Blocks

Do not demo if any are true:

- Production web does not return HTTP `200`.
- Production runtime health does not return `{"ok":true}`.
- Provider catalog has no usable provider.
- Sage cannot answer `hello`.
- User message disappears after send.
- A successful turn leaves a timeout or temporary-error banner visible.
- Raw backend errors appear in chat or composer.
- Basic cloud chat requires gateway online.
- Tools palette shows local tools enabled while gateway is offline.

## If Something Fails Live

Use the smallest safe fallback.

- If provider setup fails: switch to the already verified provider in the picker.
- If a message stalls: stop the stream with the square button, then send a shorter prompt.
- If web search stalls: do not retry more than once live; move to History/Memory/Integrations.
- If gateway is offline: say local tools are intentionally unavailable without the paired device and continue cloud chat.
- If production is degraded: stop the live demo and use screenshots or recorded evidence from the certification run.

## Certified Evidence

Latest pushed demo-cert commits:

- `53e8af9d fix: certify Sage demo surface`
- `827cf5ca docs: record phase 7 8 demo certification`
- `bdcb4827 docs: record phase 9 10 final cert`

Latest final verification:

- Frontend typecheck: passed.
- Frontend production build: passed.
- Python compile: passed.
- Targeted backend tests: `98 passed`.
- Focused browser E2E: `8 passed`.
- Production web: HTTP `200`.
- Production runtime health: `{"ok":true}`.

Final verdict: RC PASSED for the certified Sage public-demo scope.
