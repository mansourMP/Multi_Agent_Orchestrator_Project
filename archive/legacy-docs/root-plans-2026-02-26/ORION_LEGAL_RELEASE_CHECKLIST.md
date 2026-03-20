# Orion Legal Release Checklist

Use this checklist before shipping any Orion release.

## 1) License & Notices

- [ ] `THIRD_PARTY_NOTICES.md` exists and is up to date.
- [ ] Upstream license files are present in `reference/` for all referenced third-party code.
- [ ] Any directly reused third-party code paths are documented with source + license.

## 2) Branding / Trademark Guardrail

- [ ] No third-party product names appear in user-facing Orion runtime surfaces unless required for compatibility.
- [ ] No third-party logos, mascots, or brand slogans appear in Orion product UI/CLI.
- [ ] CLI help/examples use Orion wording only.

## 3) User-Facing Text Scrub

- [ ] Run `bash scripts/legal_scan_orion.sh`.
- [ ] Confirm no blocked branding strings in:
  - `scripts/orion_terminal/`
  - `bin/`
  - `frontend/`
  - `server.py`

## 4) Attribution Scope

- [ ] Any copied/adapted third-party snippets are materially modified and integrated into Orion architecture.
- [ ] Attribution requirements are satisfied for each copied dependency.
- [ ] Review performed for verbatim text blocks in onboarding/security copy.

## 5) Final Sign-Off

- [ ] Engineering sign-off complete.
- [ ] Product sign-off complete.
- [ ] Legal/compliance review completed (if required by your organization).

---

This checklist is an engineering process aid, not legal advice.
