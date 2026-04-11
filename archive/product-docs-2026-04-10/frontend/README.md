# Empyralis Frontend

This is the current Next.js browser-hosted workspace for Empyralis.

It is part of the desktop-power surface family alongside the Tauri shell. It contains the deeper workspace, builder, connector, runtime, and control surfaces while sharing the same Sage/workspace/runtime core as mobile.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind/CSS
- local API route layer under `app/api`

## Development

From [frontend](/Users/mansur/Multi_Agent_Orchestrator_Project/frontend):

```bash
npm install
npm run dev
```

The frontend runs on `http://localhost:3000`.

## Useful Commands

```bash
npm run build
npm run start
./node_modules/.bin/tsc --noEmit
```

## Notes

- This README replaces the default `create-next-app` boilerplate.
- Runtime and auth integration live behind the API route layer in `app/api`.
- Sentry config files are present but require environment variables such as `NEXT_PUBLIC_SENTRY_DSN` to be useful.
