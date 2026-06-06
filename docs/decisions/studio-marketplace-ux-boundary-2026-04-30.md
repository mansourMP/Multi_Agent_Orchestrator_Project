# Studio and Marketplace UX Boundary

Date: 2026-04-30

## Decision

Agent Studio is the builder and operations surface for specialized agents. Marketplace is the discovery and install surface for reusable packages, providers, mini-apps, and third-party templates.

They should not feel like two versions of the same page:

- Studio starts from business templates and creates private workspace specialists.
- Marketplace lets users inspect and install governed packages.
- Developer publishing is available, but hidden behind an explicit registration panel.

## Demo-Critical Studio Flow

The Studio home now starts with square specialist templates:

- Restaurant orders
- Auto parts sales
- Real estate leads
- Support FAQ
- Appointment booking
- Spreadsheet catalog
- Telegram sales
- GitHub triage

Selecting a template opens the specialist setup sheet with prefilled defaults. The setup step is intentionally simple:

- specialist name
- primary customer channel
- business/use case
- knowledge source
- advanced behavior collapsed by default

Provider, model, billing, marketplace, and detailed deploy controls stay out of the first step.

Implemented UI hardening:

- Studio now includes a clear `Custom Agent` / `Build custom` card beside the template grid.
- When no specialist is selected, the right-side panel shows the selected/default template's purpose, setup time, channel, memory default, context depth, required connectors, suggested tools, and launch checklist instead of a blank detail state.
- Existing specialists continue to appear as square operational cards after the template section.

Remaining UI hardening:

- Template cards still open the setup sheet directly. If the team wants a pure preview-first flow, split card click into `Preview` and `Use template` actions.

## Demo-Critical Marketplace Flow

Marketplace remains package discovery:

- browse governed packages
- inspect trust, billing, runtime, and model metadata
- install or configure packages

The developer package registration form is not shown by default. It is behind a `Publish a package` panel so normal users do not confuse Marketplace with Studio creation.

Implemented UI hardening:

- Marketplace now shows governed preview packages when backend inventory is empty, so the page demonstrates package discovery instead of a blank registry.
- Preview packages show package type, publisher, trust state, runtime surface, billing class, permissions/scopes, and ledger hook metadata.
- Preview packages are explicitly marked `Preview` / `Preview only`; the UI does not fake an install path for packages that are not registered in the backend.
- Developer publishing stays behind explicit developer/admin mode and is not the first thing normal users see.

Remaining UI hardening:

- Backend seed data is still needed for real installable Marketplace inventory.
- Paid third-party packages should carry revenue-share metadata. A practical starting model is 85 percent developer / 15 percent platform while supply is small, with 70 percent developer / 30 percent platform available once the marketplace matures.

## Exit Gate

This surface is demo-ready when:

- Studio home shows square template cards.
- Studio offers both template start and custom-agent creation.
- Selecting a template fills a focused detail pane and setup sheet.
- Choosing a template opens the setup sheet without navigating away.
- The first setup step is simple enough for a non-technical business owner.
- Marketplace has useful governed packages even before third-party inventory exists.
- Marketplace does not look like the place to create private specialists.
- Developer publishing is visible only when explicitly opened.
