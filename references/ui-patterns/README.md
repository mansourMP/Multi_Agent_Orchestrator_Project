# UI Pattern References

Drop external UI reference snippets here so they stay out of the runtime app.

Recommended structure:

- `21st-dev/` for 21st.dev component snippets.
- `linear/` for Linear-inspired screenshots, notes, or recreated snippets.
- `other/` for Apple/OpenAI/Vercel/assistant-ui/CopilotKit references.

Use one file per reference, for example:

- `21st-dev/clean-minimal-sign-in.tsx`
- `21st-dev/integration-card.tsx`
- `other/chat-composer-notes.md`

Rules:

- Do not import from this folder in production code.
- Treat these files as pattern references only.
- Port useful layout ideas into `frontend/lib/ui/blocks/` or existing Empyralis components with Empyralis tokens.
- Do not paste API keys, credentials, private customer data, or proprietary paid source code here.
