# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
```

The app will not boot without these. Auth is Google OAuth via Supabase — configure the Google provider in the Supabase dashboard and set the redirect URL to `{origin}/home`.

## Architecture

### Routing and auth

Next.js 15 App Router with two route groups:

- `(auth)/login` — public, Google OAuth sign-in page
- `(dashboard)/*` — protected, all six tabs share the `BottomNav` shell

`middleware.ts` guards every route: unauthenticated requests redirect to `/login`, authenticated requests on `/login` redirect to `/home`, and `/` always redirects to one or the other.

### Six tabs

| Route | Feature |
|---|---|
| `/home` | Net worth hero, sparkline, upcoming bills, recent activity |
| `/money` | Combined expense + income feed with All/Expenses/Income filter |
| `/plans` | Subscriptions (renewal countdown, monthly/annual totals) + Wishlist (progress rings) |
| `/studio` | Commission desk — Pending → Approved → In Progress → Completed → Paid flow |
| `/wallet` | Card visuals (black/gold/green styles) + Banks |
| `/calendar` | Month grid with colored event dots (gold=expense, green=income, red=sub) |

### Data model

Supabase Postgres tables (schema lives in `supabase/migrations/`): `categories`, `banks`, `cards`, `expenses`, `wishlist`, `subscriptions`, `income`, `commissions`. A read-only `ledger` view unions expenses + income + subscription payments.

Key invariants carried over from the original app:
- `expenses.savings` is a **generated column**: `coalesce(original_cost, cost) - cost`
- `subscriptions.monthly_cost` and `annual_cost` are **stored** (not derived at read time) — recompute and write on every subscription save using `calcSubCosts()` in `src/lib/utils.ts`
- Income is a **first-class table** (not mixed into a master ledger). The `ledger` view provides the unified read layer
- `commissions.cal_event_id` is set when a commission is Approved (creates a Google Calendar event); cleared and recreated on deadline changes

### Supabase clients

Two clients, never swap them:
- `src/lib/supabase/client.ts` — browser (use in `'use client'` components)
- `src/lib/supabase/server.ts` — server components and API routes (cookie-aware, async)

### Current data phase

Pages currently use **seed data** from `src/lib/data/transactions.ts` (SeedTx interface, SEED_TRANSACTIONS array). Supabase queries will replace these file imports tab by tab. When wiring a tab to Supabase, delete the seed imports and use `src/lib/supabase/client.ts` in client components or `server.ts` in server components.

### UI components (`src/components/`)

- `nav/BottomNav.tsx` — 6-tab fixed nav, 72px tall; active state via `usePathname()`
- `ui/Pill.tsx` — exports `Pill` (single) and `PillGroup<T>` (segmented control with gold active state)
- `ui/Button.tsx`, `Card.tsx`, `Badge.tsx`, `Skeleton.tsx` — primitives
- `money/AddTransactionSheet.tsx` — canonical bottom sheet implementation (reference for building other sheets)

### Design system

Tailwind custom theme in `tailwind.config.ts`. Key tokens:

| Token | Value | Use |
|---|---|---|
| `bg-base` | `#080810` | page background |
| `bg-surface` | `#0f0f1a` | cards |
| `bg-overlay` | `#1c1c2a` | icon backgrounds, popovers |
| `gold` | `#f59e0b` | active nav, accents, positive amounts (Studio) |
| `emerald` | `#22c55e` | income, positive deltas, success states |
| `ruby` | `#ef4444` | expenses, overdue, destructive |
| `ink` | `#f0f0f8` | primary text |
| `ink-muted` | `#7a7a9a` | secondary text |
| `ink-faint` | `#45455a` | labels, placeholders |

Fonts are CSS variables loaded via `next/font/google` in `src/app/layout.tsx`:
- `--font-inter` → `font-sans` — all UI text
- `--font-dm-mono` → `font-mono` — every dollar amount and number

Utility classes defined in `globals.css`: `gradient-gold`, `gradient-emerald`, `glass`, `glow-green/gold/ruby`, `tab-enter` (page transition animation), `skeleton`.

Active nav items get `text-gold` + a gold drop-shadow glow. The pill toggle (Subscriptions/Wishlist, Cards/Banks, filter pills) uses `gradient-gold` for the active state and `bg-bg-surface border border-white/[0.06]` for inactive.

### Typography conventions

| Element | Classes |
|---|---|
| Page eyebrow | `text-[10px] font-medium tracking-[0.14em] uppercase text-gold` |
| Page title | `text-[32px] font-bold tracking-[-0.04em] text-ink` |
| Section label | `text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint` |
| Stat hero | `text-[26px] font-bold font-mono tracking-tight` |
| Row primary | `text-[14px] font-medium text-ink` |
| Row secondary | `text-[11px] text-ink-muted` |
| Row amount | `text-[15px] font-semibold font-mono` |

### Amount display rules

- **Income**: `text-emerald`, prefixed with `+`
- **Expense in a row**: `text-ink` (not ruby — only stat cards use ruby for the "Spent" total)
- Use the unicode minus `−` (U+2212), never a hyphen `-`, before expense amounts

### Recurring layout patterns

**Card list** (transactions, subscriptions, etc.):
```tsx
<div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
```

**Icon cell** (left of a list row):
```tsx
<div className="w-9 h-9 rounded-[10px] bg-bg-overlay flex items-center justify-center text-[15px] flex-shrink-0">
```

**Bottom sheet pattern**: fixed position, `translate-y-full` ↔ `translate-y-0` with `transition-transform duration-300`, `rgba(0,0,0,0.72)` backdrop, `rounded-t-[24px]` top corners, drag handle (`w-9 h-1 rounded-full bg-white/20`). Form state resets after close animation via `setTimeout(..., 300)` in a `useEffect` watching `open`.

Every page root `<div>` should include `tab-enter` for the mount animation.

### Key utilities (`src/lib/utils.ts`)

- `$f(n)` — `$1,234` (whole dollars)
- `$fc(n)` — `$12.50` (with cents)
- `$fk(n)` — `$4.8K` (compact)
- `calcSubCosts(cost, billing)` — returns `{ monthly, annual }` matching the original app's exact multipliers (Annual÷12, BiWeekly×2.17/26, Quarterly÷3/×4, Weekly×4.33/52)
- `daysUntil(date)` / `daysUntilLabel(date)` — "in 3 days" / "today" / "2 days ago"
- `localToday()` — returns today as `YYYY-MM-DD` in `America/Los_Angeles` (hardcoded to match original app)
- `groupByMonth(rows)` — groups any `{ date: string }` array into `{ label, key, rows }[]` sorted newest-first
- `cn(...classes)` — Tailwind className joiner

### Studio commission flow

Status transitions: `Pending → Approved → In Progress → Completed → Paid`

- **Approve**: creates a Google Calendar event (store `cal_event_id` on the commission row)
- **Mark Paid**: creates an `income` row with `source: 'Freelance'` and `commission_id` pointing back; sets `commissions.income_id` and `paid_at`

The Google Calendar integration is proxied through `src/app/api/calendar/route.ts` (keeps credentials server-side). Direct gapi calls from the client are not used in the new app.
