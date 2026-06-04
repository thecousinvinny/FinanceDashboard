# CLAUDE.md

## Critical constraint

**`index.html` must never be modified, moved, renamed, or deleted.** It is the original working finance dashboard connected to live Google Sheets data. All new development lives exclusively inside `hoardr/`.

## Repository layout

```
FinanceDashboard/
├── index.html          ← read-only, original app (Google Sheets + gapi)
├── Design/             ← mockup PNGs (6 screens) used as design reference
└── hoardr/             ← Next.js 15 rebuild (all active development here)
```

## Commands (run from inside `hoardr/`)

```bash
npm run dev        # start dev server with Turbopack on localhost:3000
npm run build      # production build
npx tsc --noEmit   # type-check without emitting (use before committing)
```

There are no tests yet. TypeScript strict mode is on — `npx tsc --noEmit` is the lint step.

## Environment

Copy `.env.local.example` to `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

`NEXT_PUBLIC_SUPABASE_*` — required to boot. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — server-only; used by `src/app/api/calendar/route.ts` to refresh Google OAuth tokens for Calendar CRUD. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — optional; enables Places Autocomplete in calendar event sheets. Auth is Google OAuth via Supabase — configure the Google provider in the Supabase dashboard and set the redirect URL to `{origin}/home`.

See `hoardr/CLAUDE.md` for full architecture documentation.
