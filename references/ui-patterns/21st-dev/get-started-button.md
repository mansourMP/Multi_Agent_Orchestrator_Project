Get Started Button (21st.dev pattern)

Source pattern source:
`npx shadcn@latest add https://21st.dev/r/ozantekin/get-started-button`

Original sample intent:

- `GetStartedButton` is a call-to-action with a compact expanding rail-style chevron area.
- "Get Started" text fades on hover while the right-side action area expands.
- The visual should feel intentional and high-trust, not generic.

Implementation notes for Empyralis:

- Do not import shadcn/CVA/radix in production if not already present.
- Keep class names in the project’s CSS-token style.
- Prefer a single reusable primitive (`AppGetStartedButton`) with:
  - primary and optional secondary tone compatibility
  - `href` support for navigation actions
  - subtle state motion only (hover and active)

