---
name: web-search
description: Agent can search the web using the web_search tool. Use when the user asks about current events or facts.
enabled: true
---

# Web Search

Use `web__search` to find current information and `web__fetch` to inspect the most relevant page.

## Rules

- Prefer `web__search` first for current facts and recent events.
- Use `web__fetch` only when a result needs deeper reading.
- Cite the source URL in the answer when the result matters.
