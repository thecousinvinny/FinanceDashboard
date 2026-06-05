# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands (run from inside `hoardr/`)

```bash
npm run dev        # dev server with Turbopack on localhost:3000
npm run build      # production build
npx tsc --noEmit   # type-check (the lint step — no test suite yet)
```

## Routing and auth

Next.js 15 App Router, two route groups:
- `(auth)/login` — public Google OAuth sign-in
- `(dashboard)/*` — protected; all tabs share the `BottomNav` shell + `ProfileDrawer` avatar button

`middleware.ts` guards every route (unauthenticated → `/login`; logged-in on `/login` → `/home`; `/` → one or the other).

## Navigation — five tabs

`BottomNav` has five tabs. All `<Link>` use the `replace` prop so tab-switching does **not** build browser history — this prevents the iOS back-swipe gesture from navigating between tabs.

| Route | Label | Feature |
|---|---|---|
| `/home` | Hoard | Net worth hero, sparkline, upcoming bills, recent activity |
| `/money` | Out | 30-day bar chart + expense/income feed with filter |
| `/in` | In | Income list + Cards + Banks (three-tab PillGroup) |
| `/calendar` | Calendar | Compact month grid (phone) / Notion-style infinite grid (iPad+) |
| `/studio` | Studio | Commission desk — Pending → Approved → In Progress → Completed → Paid |

`/wallet` and `/plans` redirect to `/in`. `/settings` still exists (categories + defaults sub-pages) but is **not** in the nav — reached via the profile button.

**Profile button** (`src/components/profile/ProfileDrawer.tsx`) — fixed avatar button top-right on every page; hidden on `/profile` and `/settings`. Tapping navigates to `/profile`. Hidden by checking `usePathname()`.

**`/profile` page** — full analytics page: avatar upload (Supabase Storage `avatars` bucket), editable display name (`profiles.display_name`), stats tiles, mirrored income/spending sparkline with long-press scrub, four `MonthAnnualCard` swipeable analytics sections (Expenses, Top Categories, Subscriptions, Income), all-time summary. Settings gear navigates to `/settings`.

**`/in` page** — three PillGroup tabs (`History | Streams | Accounts`). History: income rows filtered `date <= today`. Streams: `revenue_streams` table + bank interest streams; `autoGenerateStreams(userId, streams)` runs once per session (`let sessionAutoGenDone = false` guard). Accounts: bank list + card visuals with long-press drag-to-reorder.

**`/settings`** — Appearance (theme, icon mode, week start), Calendar filters, Defaults (default card/bank/category/billing), Sign out. Categories and Defaults are sub-pages.

## Data model

Tables (schema in `supabase/migrations/`): `categories`, `banks`, `cards`, `expenses`, `wishlist`, `subscriptions`, `income`, `commissions`, `revenue_streams`, `cal_events`. `profiles` stores per-user data. `ledger` view unions expenses + income + subscription payments.

Key invariants:
- `expenses.savings` is a **generated column**: `coalesce(original_cost, cost) - cost`
- `expenses` has **no direct `category` column** — category is a FK to `categories`. Query via `categories(name)` join; PostgREST returns it as a `{ name: string }` **object** (not array) for many-to-one FK. Cast: `(e.categories as { name: string } | null)?.name`.
- `subscriptions.monthly_cost` / `annual_cost` are **stored** — recompute with `calcSubCosts()` on every subscription save
- Income is a **first-class table**, not mixed into ledger
- `commissions.cal_event_id` set on Approve; cleared and recreated on deadline changes
- `wishlist_status` enum includes `'Ordered'`; `wishlist.ordered_at text` stores purchase date. **No `expense_id` column** — don't spread it into wishlist updates.
- `cal_events` recurrence columns: `recurrence_rule text` (RRULE without prefix), `recurrence_exceptions text[] default '{}'`, `recurrence_parent_id uuid` (reserved)
- `profiles` has: `google_refresh_token`, `calendar_prefs` (jsonb), `avatar_url text`, `display_name text`
- Supabase Storage bucket `avatars` (public) — user files stored at `{userId}/avatar.jpg`

## Supabase clients

Two clients — never swap:
- `src/lib/supabase/client.ts` — browser (`'use client'` components)
- `src/lib/supabase/server.ts` — server components and API routes (cookie-aware, async)

## Async safety pattern (required on every `'use client'` page)

Rapid tab switching causes in-flight queries to resolve after unmount → Safari WKWebView crashes. Every client page must guard with a generation counter + AbortController. Canonical example: `home/page.tsx`. Pattern: `loadGen = useRef(0)`, `abortRef = useRef<AbortController|null>(null)`, increment gen and abort on each call, discard result if `gen !== loadGen.current`. Cleanup: `return () => { loadGen.current++; abortRef.current?.abort() }`. Second data fetch needs a separate `detailGen` + `detailAbortRef`.

## pageCache (`src/lib/page-cache.ts`)

Module-level in-memory cache, TTL = 60s. Used by all tabs to show stale data while background refresh runs.
- `pageCache.get<T>(key)` / `pageCache.set(key, data)` — call set after successful load, before `setLoading(false)`
- Init state: `useState(pageCache.get('key') ?? [])` and `useState(!pageCache.get('key'))` for loading flag

## Toast notifications (`src/lib/toast.ts`)

Module-level emitter — call from anywhere. `<ToastContainer />` mounted in `(dashboard)/layout.tsx`.
- `showToast('msg', { type: 'add' })` — 2.5s, emerald dot
- `showToast('msg', { type: 'payment' })` — 2.5s, gold dot
- `showToast('msg', { type: 'delete', undo: { onUndo, onCommit } })` — 5s, ruby dot + Undo button

**Deferred delete**: remove from local state optimistically, capture snapshot in `onUndo`, fire DB delete only in `onCommit` (after 5s).

**Exception — `income` table**: immediate DB delete at swipe time. `pendingDeleteIds = useRef(new Set<string>())` prevents `loadIncome` from re-inserting mid-delete rows. `onUndo` re-inserts to DB; `onCommit` just clears the id.

## UI components (`src/components/`)

- `nav/BottomNav.tsx` — 5-tab fixed nav, 72px tall. Tab order: Hoard/Out/In/Calendar/Studio. All `<Link>` use `replace`. Active = 2px sliding gold bar at **top** of nav.
- `nav/TabSwipeNavigator.tsx` — **not mounted anywhere**; file exists but is unused. Inter-tab swipe was removed in favour of `replace` navigation.
- `hooks/usePillSwipe.ts` — used by `/money` and `/in`. Handles **intra-tab pill switching only** — cross-route navigation was removed. Args: `(tab, setTab, options)`.
- `ui/CategoryIcon.tsx` — checks `categoryMeta[name]` first (DB icon/color), then hardcoded defaults. `text-gold` expenses, `text-emerald` income. DB color applied via inline `style={{ color }}`, overriding Tailwind.
- `ui/SwipeToDelete.tsx` — swipe-left-to-delete; `onTap` fires on clean tap only; `actionBg` default `bg-ruby`. `onRight`/`rightLabel`/`rightBg` for right-swipe confirm. Press-scale + haptic built in.
- `money/AddTransactionSheet.tsx` — canonical bottom sheet; exports `CardOption`, `BankOption`
- `wallet/RevenueStreamSheet.tsx` — `RevenueStreamConfig: { id, name, amount, freq, bankId, nextPayDate }`. **No DB ops** — calls `onDone(config)` synchronously.
- `wallet/CardVisual.tsx` — renders card from `Card` prop using `CARD_STYLE_DEFS`. `getTexturePattern` inline (JSX). Accepts `expenseCount?`, `subCount?`.
- `ui/SemanticColorSheet.tsx` — accent color customization (Income/Expense/Subs). `react-colorful`. Dispatches `sem-colors-changed` on save.
- `calendar/RecurrencePicker.tsx` — `z-[70]`. Preset list + custom builder.
- `calendar/EditEventSheet.tsx` — iPhone sheet for create/edit. `EditableEvent.id` optional (no id = create mode). Cross-midnight: auto-bumps `endDate` +1 when `endTime < startTime`.
- `calendar/CalendarPopover.tsx` — Notion-style popover for large screens; falls back to centered modal on iPhone. Google Places: use `defaultValue` (not `value`) — Places mutates DOM directly.
- `profile/ProfileDrawer.tsx` — fixed avatar button top-right on every dashboard page. Hidden on `/profile` and `/settings`. Reads `profiles.avatar_url` and `profiles.display_name`; falls back to Google OAuth avatar and name from `user_metadata`.
- `home/HomeHero.tsx` — sparkline card. `gestureMode` ref coordinates flick-to-switch vs long-press-to-scrub with child `SparkChart`.
- `home/SparkChart.tsx` — three series (inc/exp/sub). Gradients use `gradientUnits="userSpaceOnUse"`. Fill colors read via `getComputedStyle` (not inline `var()` — WebKit SVG). Touch via native `addEventListener` `{ passive: false }`; 300ms long-press → scrub.

## Inline hero components (defined in-file, not extracted)

- `DailyBarChart` (money page) — 30-day net bars, RAF height transition
- `CategoryPillBar` (money page) — 32px animated pill bar. Track `#1C2A36`, gold gradient fill.
- `IncomeBarChart` (in page) — 6-month bars using `rgba(--sem-income-rgb, opacity)`. Listens to `sem-colors-changed`.
- `StatCard` (in page) — `SlotNumber` stat tile.
- Analytics cards in `/profile` page: `MirroredSparklines` (income up / spending down, shared center axis, long-press scrub), `MonthAnnualCard` (shared swipeable Month/Annual wrapper), `CategoryPills`, `SimpleBars`, `CostPills`.

## Design system

Tailwind custom theme in `tailwind.config.ts`:

| Token | Value | Use |
|---|---|---|
| `bg-base` | `#080810` | page background |
| `bg-surface` | `#0f0f1a` | cards |
| `bg-overlay` | `#1c1c2a` | icon backgrounds, popovers |
| `gold` | `#D4AF37` | active nav, accents, positive amounts |
| `emerald` | `#22c55e` | income, positive deltas |
| `ruby` | `#ef4444` | expenses, overdue, destructive |
| `ink` | `#f0f0f8` | primary text |
| `ink-muted` | `#7a7a9a` | secondary text |
| `ink-faint` | `#45455a` | labels, placeholders |

Fonts: `--font-montserrat` → `font-sans` + `font-mono` (all UI). `--font-big-shoulders` → display numerics only, always via `style={{ fontFamily: 'var(--font-big-shoulders)' }}`.

Utility classes in `globals.css`: `gradient-gold`, `gradient-emerald`, `glass`, `tab-enter`, `skeleton`.

Hardcoded gold hex: always `#D4AF37`, never `#f59e0b`.

**Semantic colors** — `text-emerald`/`text-gold` map to `var(--sem-income)`/`var(--sem-expense)`. When a gradient accent is set, `-webkit-text-fill-color: transparent` inherits into children — scroll-clipped text (like `SlotNumber`) must reset `WebkitTextFillColor: 'currentColor'` on its innermost span.

**Inline styles** — use CSS variables (`var(--color-bg-base)`, `rgb(var(--rgb-X) / alpha)`), never hardcode dark hex — breaks light themes.

## Typography conventions

| Element | Classes |
|---|---|
| Page eyebrow | `text-[10px] font-medium tracking-[0.14em] uppercase text-gold` |
| Section label | `text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint` |
| Stat hero | `text-[26px] font-bold font-mono tracking-tight` |
| Row primary | `text-[14px] font-medium text-ink` |
| Row secondary | `text-[11px] text-ink-muted` |
| Row amount | `text-[15px] font-semibold font-mono` |

## Amount display rules

- Income: `text-emerald`, prefix `+`
- Expense in a row: `text-ink` (neutral)
- Spent stat card: `text-gold` (not ruby — RORK system)
- Use unicode minus `−` (U+2212), never hyphen `-`

## Icon color rules

Three-way semantic rule (Home, Money, `/in`):
- Income → `text-emerald`
- Sub payment (name matches active sub, case-insensitive) → `text-white/60`
- Regular expense → `text-gold`

When `IconColorMode = 'category'`, use DB-stored color via `categoryMeta` instead. Toggle on Settings page. Use `getIconColorMode()` / `setIconColorMode()`.

## Touch gesture coordination (`gestureMode` ref)

Shared `{ current: 'undecided' | 'swiping' | 'scrubbing' }` between parent (swipe-to-navigate) and child (long-press-to-scrub):
- Parent resets to `'undecided'` on touchstart; bails on touchend if `'scrubbing'`
- Child (native `addEventListener`, `{ passive: false }`) starts 300ms timer; cancels if finger moves >8px; on fire sets `'scrubbing'` and calls `haptic('tap')`; resets to `'undecided'` on touchend

Any long-press component needs `select-none` + `style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}`. Keep data accessed in native-listener closures in refs updated by a separate `useEffect`; main listener effect uses empty deps `[]`.

## Recurring layout patterns

Card list: `className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]"`

Icon cell (circle): `w-10 h-10 rounded-full bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0`

Icon cell (rounded square): `w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0`

## Bottom sheet rules

Canonical implementation: `money/AddTransactionSheet.tsx`.

- `height: calc(100dvh - env(safe-area-inset-top, 44px) - 8px)` (not `maxHeight`) with `flex flex-col`
- Scroll area: **inline** `style={{ flex: 1, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}`
- **Never** `document.body.style.overflow = 'hidden'` — breaks iOS touch scroll
- Background lock: `body.style.position = 'fixed'` + `body.style.top = -scrollY` + `documentElement.overscrollBehavior = 'none'` + direction-aware touchmove preventDefault
- Swipe-down dismiss: direct DOM mutation on `sheetRef`. Dismiss threshold: 80px. Clear inline styles inside setTimeout *before* `onClose()`.
- Keyboard scroll: `visualViewport` resize listener pads scroll area, scrolls focused field above keyboard
- `usePullToRefresh` skips when `body.style.position === 'fixed'` — do not remove this guard
- `z-[60]` for sheets; `z-[70]` for RecurrencePicker above sheets; `z-[55]` for ProfileDrawer (below sheets)

Every page root `<div>` includes `tab-enter`. Each route has a `loading.tsx` skeleton.

## Key utilities (`src/lib/utils.ts`)

- `$f(n)` — `$1,234` | `$fd(n)` — cents when non-zero | `$fc(n)` — always cents | `$fk(n)` — compact (`$4.8K`)
- `calcSubCosts(cost, billing)` — `{ monthly, annual }`
- `localToday()` — `YYYY-MM-DD` in `America/Los_Angeles`. **Always use for dates written to DB.** Never `new Date().toISOString().slice(0,10)` (UTC). **Exception — calendar `isPast`**: use `new Date()` directly to avoid timezone mismatch.
- `haptic(style)` — `'tap'` (6ms) / `'confirm'` (10ms) / `'delete'` (double-pulse)
- `cn(...classes)`, `groupByMonth(rows)`, `clamp(v,min,max)`, `daysUntil(date)`, `nextRenewalDate(from, billing)`

## Theme system (`src/lib/theme.ts`)

Import from here, never re-define:
- `Theme`: `'obsidian' | 'charcoal-slate' | 'slate-mist' | 'midnight-teal'`
- `applyTheme(t)`, `readTheme()` (default `'obsidian'`)

`slate-mist` is the light theme. Pre-render inline script in `layout.tsx` applies theme before hydration. Viewport: `interactiveWidget: 'resizes-visual'` — nav never shifts on keyboard.

## Category metadata (`src/lib/category-meta.ts`)

- `categoryMeta: Record<string, CategoryMeta>` — module-level cache. `setCategoryMeta(cats)` populates it. Not React context — direct import.
- `ICON_REGISTRY` — 48 Lucide icons, keys are component names (`'Utensils'`, `'Gamepad2'`, etc.)
- `BUILTIN_EXPENSE_CATEGORIES` / `BUILTIN_INCOME_CATEGORIES` — used for initial DB seed

## App preferences

- `src/lib/app-prefs.ts` — `AppPrefs { defaultBankId, defaultBankName, defaultExpCat, defaultBilling }` in `localStorage('hoardr-app-prefs')`. `getAppPrefs()` / `setAppPrefs(patch)`.
- `src/lib/week-start.ts` — `getWeekStartsMonday()` / `setWeekStartsMonday(v)` in `localStorage('week-start-monday')`.

## `/in` page data storage

- `revenue_streams` table — `{ id, user_id, name, amount, freq, bank_id, next_pay_date }`. `autoGenerateStreams` inserts income rows for due streams, advances `next_pay_date`.
- `banks` columns — `balance`, `apy`, `next_interest_date`, `interest_freq`. Balance does **not** auto-update when income lands — set manually.

## Card styles & textures (`src/lib/cardStyles.ts`)

- `CARD_STYLE_DEFS` — 12 gradient styles; `CARD_TEXTURE_DEFS` — 8 textures
- `getTexturePattern` is in `CardVisual.tsx` (JSX — can't live in `.ts`)
- `cards.sort_order int` — long-press drag-to-reorder (450ms, `haptic('tap')`, `flushSync`, native listeners `passive:false`). No Reorder button.

## RRULE expansion (`src/lib/rrule.ts`)

- `expandRRule(rule, baseDate, rangeStart, rangeEnd, exceptions?)` — RRULE without prefix → `YYYY-MM-DD[]`
- `rruleLabel(rule, baseDate)` — human-readable summary
- **Postgres TIME columns** (`start_time`, `end_time`) come as `'HH:MM:SS'` from PostgREST — always `.slice(0, 5)` before use
- Cross-midnight events pushed to **both** start date and next day, both carrying `instanceDate = baseDate`

## FAB pattern

Circular gold FAB: `fixed`, `right: 16, bottom: 80`, `width: 56, height: 56`, `zIndex: 40`, `className="gradient-gold rounded-full"`. All tabs except Settings. Never use a header button for add actions.

## Calendar page architecture

Single client component (`calendar/page.tsx`), two panels on a horizontal rail: `transform: translateX(-${viewIndex * 100}vw)`. `viewIndex: 0 | 1`.

**Panel 0 mobile** — compact month grid (`GRID_EXPANDED = 280px`) + day list with drag handle. Day tap scrolls list via `scrollTop` (never `scrollIntoView` — fails in iOS WKWebView fixed containers). Edge-zone inter-tab: inline `p0Start`/`p0End` handlers (Studio ← Calendar → In).

**`months`** — drives infinite day list. `topSentRef`/`botSentRef` IntersectionObservers skip on large-screen month mode.

**`notionWeeks`** — large-screen month grid only. 48 weeks centered on today's Sunday. `addWeeks()` uses local `new Date(y, m-1, d + n*7)` (never UTC).

**Notion grid**: `MAX_VIS_EVENTS=6`, `EV_ROW_H=20`, `CELL_MIN_H=163`. Drag-and-drop: `isBeingDragged = !!dragState && !!ev.id && dragState.ev.id === ev.id` — the `!!ev.id` guard is critical; `undefined === undefined` would fade all finance pills.

**Finance events** — `CalEvent` type: `type: 'income'|'sub'|'google'`. Custom events carry `recurrenceRule?` and `instanceDate?`.

**Recurring scopes** (`'this'|'following'|'all'`): `'this'` adds to `recurrence_exceptions`; `'following'` sets UNTIL; `'all'` deletes parent row. All use deferred-delete toast.

## Studio commission flow

`Pending → Approved → In Progress → Completed → Paid`

Approve → creates Google Calendar event (`cal_event_id`). Mark Paid → creates `income` row (`source: 'Freelance'`). Google Calendar proxied through `src/app/api/calendar/route.ts`. Always use `timedEvent()` from `src/lib/calendar.ts` — never build GCal `dateTime` strings manually.
