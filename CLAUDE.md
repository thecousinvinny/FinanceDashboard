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
| `/money` | 30-day bar chart hero + combined expense/income feed with filter |
| `/plans` | 30-day renewal strip hero + Subscriptions/Wishlist toggle |
| `/studio` | Commission desk — Pending → Approved → In Progress → Completed → Paid flow |
| `/wallet` | Card visuals (12 styles, 8 textures) + Banks |
| `/calendar` | Compact month grid (phone) / Notion-style infinite grid with sidebar (iPad+) |

### Data model

Supabase Postgres tables (schema lives in `supabase/migrations/`): `categories`, `banks`, `cards`, `expenses`, `wishlist`, `subscriptions`, `income`, `commissions`. A read-only `ledger` view unions expenses + income + subscription payments.

Key invariants carried over from the original app:
- `expenses.savings` is a **generated column**: `coalesce(original_cost, cost) - cost`
- `subscriptions.monthly_cost` and `annual_cost` are **stored** (not derived at read time) — recompute and write on every subscription save using `calcSubCosts()` in `src/lib/utils.ts`
- Income is a **first-class table** (not mixed into a master ledger). The `ledger` view provides the unified read layer
- `commissions.cal_event_id` is set when a commission is Approved (creates a Google Calendar event); cleared and recreated on deadline changes
- `wishlist_status` enum includes `'Ordered'` (added by migration `20260518_wishlist_ordered.sql`); `wishlist.ordered_at text` stores the purchase date. Do **not** spread non-existent columns into wishlist updates — the table has no `expense_id` column.

### Supabase clients

Two clients, never swap them:
- `src/lib/supabase/client.ts` — browser (use in `'use client'` components)
- `src/lib/supabase/server.ts` — server components and API routes (cookie-aware, async)

### Server vs client pages

All six tabs are `'use client'` components that fetch on mount via `src/lib/supabase/client.ts`. There are no server-rendered data pages — the only server-side logic is `middleware.ts` (auth guard) and `src/app/api/` routes.

### Async safety pattern (required on every `'use client'` page)

Rapid tab switching causes in-flight Supabase queries to resolve after a component unmounts, which produces setState-on-unmounted-component crashes in Safari's WKWebView. Every client page **must** use a generation counter to discard stale results:

```typescript
const supabase   = useMemo(() => createClient(), [])
const loadGen    = useRef(0)
const abortRef   = useRef<AbortController | null>(null)

const loadData = useCallback(async () => {
  abortRef.current?.abort()
  const controller = new AbortController()
  abortRef.current = controller
  const gen = ++loadGen.current
  try {
    const { data } = await supabase.from('...').select('...').abortSignal(controller.signal)
    if (gen !== loadGen.current) return   // unmounted or superseded — discard
    setState(data ?? [])
    setLoading(false)
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return
    console.error('loadData error:', err)
  }
}, [supabase])

useEffect(() => {
  loadData()
  return () => { loadGen.current++; abortRef.current?.abort() }
}, [loadData])
```

If a page has a second `useEffect` for detail data (e.g. Wallet card detail), use a separate `detailGen = useRef(0)` and `detailAbortRef` with the same pattern.

### pageCache (`src/lib/page-cache.ts`)

Module-level in-memory cache (survives tab switches within a session, clears on hard reload). TTL = 60 seconds. Used by all six tabs (Home, Money, Plans, Studio, Wallet, Calendar) to show stale data instantly while the background refresh runs.

- `pageCache.get<T>(key)` — returns `T | undefined` (undefined if missing or expired)
- `pageCache.set(key, data)` — call after a successful load, before `setLoading(false)`
- Initialize state from cache: `useState<T[]>(pageCache.get<T[]>('key') ?? [])` and `useState(!pageCache.get('key'))` for the loading flag

### Toast notifications (`src/lib/toast.ts`)

Module-level event emitter — callable from anywhere without React context. `<ToastContainer />` is mounted once in `(dashboard)/layout.tsx` and subscribes to it.

```typescript
showToast('Thing added',   { type: 'add' })       // 2.5s, emerald dot
showToast('Thing paid',    { type: 'payment' })    // 2.5s, gold dot
showToast('Thing deleted', {                        // 5s, ruby dot + Undo button
  type: 'delete',
  undo: {
    onUndo:   () => restoreLocalState(),   // fires immediately on Undo tap
    onCommit: () => supabase.delete(...),  // fires after 5s if not undone
  },
})
```

**Deferred delete pattern**: remove from local state optimistically, capture a snapshot in the `onUndo` closure to restore it, fire the actual DB delete only in `onCommit`. This gives the user a 5-second undo window with zero latency on the optimistic removal.

### Data phase

All six tabs are wired to live Supabase. `src/lib/data/transactions.ts` still exists but is only used as a type source — `SeedTx` is kept as the in-memory row shape in `money/page.tsx` (Supabase rows are normalized into it on load). `SEED_TRANSACTIONS` is unused and can be deleted.

### UI components (`src/components/`)

- `nav/BottomNav.tsx` — 6-tab fixed nav, 72px tall; active state via `usePathname()`
- `ui/Pill.tsx` — exports `Pill` (single) and `PillGroup<T>` (segmented control with gold active state)
- `ui/CategoryIcon.tsx` — exports `CategoryIcon` (React component) and `getCategoryIcon` (returns a `LucideIcon`). Maps real Google Sheets category names (`Food`, `Fun`, `Tesla`, `Apparel`, `Tech`, `Home`, `Health`, `Travel`, `PC`, `Life`, `Gift`, `Insurance`, `Stocks`, `Other`, `Subscriptions` for expenses; `Repayment`, `Refund`, `Freelance`, `Projects`, `Stocks`, `Other` for income). Pass `className` to color the icon — use `text-gold` for expenses, `text-emerald` for income.
- `ui/SwipeToDelete.tsx` — swipe-left-to-delete with optional `onTap` (fires on clean tap when not swiped/revealed), `actionLabel`, and `actionBg` props. The `actionBg` default is `bg-ruby`; pass `'bg-amber-500'` for a cancel/restore action. Also accepts `onRight` / `rightLabel` / `rightBg` for a right-swipe confirm action (e.g. pay). Includes automatic press-scale animation (97%) and haptic feedback — no configuration needed.
- `money/AddTransactionSheet.tsx` — canonical bottom sheet implementation; exports `CardOption` and `BankOption` interfaces used by all pickers
- `money/EditTransactionSheet.tsx` — edit existing transaction; exports `TxEdits`
- `plans/AddSubscriptionSheet.tsx` / `EditSubscriptionSheet.tsx` — exports `NewSub` / `SubEdits`
- `plans/AddWishlistSheet.tsx` / `EditWishlistSheet.tsx` — exports `WishEdits`
- `wallet/CardVisual.tsx` — renders a credit card from a `Card` prop using `CARD_STYLE_DEFS`; draws SVG texture overlay from `getTexturePattern` (defined inline); use this everywhere a card is displayed
- `wallet/AddCardSheet.tsx` / `EditCardSheet.tsx` — card add/edit sheets with grouped 12-style color picker and 8-texture picker; `NewCard` and `CardEdits` interfaces both include `texture: CardTexture`

**Wallet sub stats** (Sub/Mo, Sub/Yr, All Time) are computed by cross-referencing actual paid expenses against subscription names via a case-insensitive `Set`: `new Set(cardSubs.map(s => s.name.toLowerCase()))`. The subscription name in the `subscriptions` table **must exactly match** the expense name (case-insensitive) for payments to be counted. A name mismatch silently drops those payments from the stats.
- `home/SparkChart.tsx` — cumulative monthly sparkline with three series: `inc` (income), `exp` (non-sub expenses), `sub` (subscription payments). Values are **running totals from day 1 of the current month** — lines start at 0 on the 1st and climb to today. X-axis uses sparse absolute-positioned landmark labels (5 max) so it never squishes regardless of month length. `DayPoint { day, label, exp, inc, sub }` — all three fields are cumulative totals, not daily amounts.
- `home/UpcomingBills.tsx` — receives `initial: UpcomingSub[]` from the home client page. Right-swipe pays (creates an expense + advances `next_renewal`), left-swipe cancels (sets status `Cancelled`). Home data refreshes via pull-to-refresh or the 60s cache TTL (not `router.refresh()` — home has no server component).

### Card / bank picker pattern

All Add and Edit sheets accept `cards?: CardOption[]` and/or `banks?: BankOption[]`. Expenses attach to a card; income attaches to a bank; subscriptions attach to a card. The picker renders a horizontal chip strip with a "None" chip first:

```tsx
// CardOption: { id: string; name: string; last4?: string | null }
// BankOption: { id: string; name: string }
```

Load wallet data once on mount in a **separate** `useEffect` (not inside `loadData` which runs after mutations) to avoid redundant queries.

### Tap-to-edit pattern

Wrap each list row in `<SwipeToDelete onDelete={...} onTap={() => setEditTarget(row)}>`. The `onTap` callback only fires on clean taps — not when the user swipes or when the delete action is already revealed. Open the corresponding Edit sheet by setting state: `editSub`, `editTx`, `editWish`, etc.

### Inline hero components

`DailyBarChart` (Money page) and `RenewalStrip` (Plans page) are defined as named functions in the same file as their page — they are **not** extracted to `src/components/`. Both are computed entirely from already-loaded page state (no new queries). Follow this pattern for page-specific visualizations.

- `DailyBarChart`: 30-day net bars, `requestAnimationFrame` triggers CSS height transition, emerald/gold/zero coloring (not ruby), gold dot for today
- `RenewalStrip`: 30-day horizontal scrollable chip strip, `scrollIntoView` on mount, ruby pips for renewals, tap-to-expand detail panel

### Design system

Tailwind custom theme in `tailwind.config.ts`. Key tokens:

| Token | Value | Use |
|---|---|---|
| `bg-base` | `#080810` | page background |
| `bg-surface` | `#0f0f1a` | cards |
| `bg-overlay` | `#1c1c2a` | icon backgrounds, popovers |
| `gold` | `#D4AF37` | active nav, accents, positive amounts (Studio) |
| `gold.light` | `#F7DF9E` | gradient start (cream gold) |
| `gold.dark` | `#A47F23` | gradient end (deep gold) |
| `emerald` | `#22c55e` | income, positive deltas, success states |
| `ruby` | `#ef4444` | expenses, overdue, destructive |
| `ink` | `#f0f0f8` | primary text |
| `ink-muted` | `#7a7a9a` | secondary text |
| `ink-faint` | `#45455a` | labels, placeholders |

Fonts are CSS variables loaded via `next/font/google` in `src/app/layout.tsx`:
- `--font-montserrat` → both `font-sans` and `font-mono` (Tailwind maps both aliases to Montserrat) — all UI text and numbers
- `--font-big-shoulders` — display numerics only (stat heroes, calendar day numbers); use as inline `style={{ fontFamily: 'var(--font-big-shoulders)' }}`, not via a Tailwind class

Utility classes defined in `globals.css`: `gradient-gold` (`135deg, #F7DF9E → #D4AF37 → #A47F23`), `gradient-emerald`, `glass`, `glow-green/gold/ruby`, `tab-enter` (page transition animation), `skeleton`.

Active nav items get `text-gold` and a `w-1 h-1 rounded-full bg-gold` dot below the label — no glow pill or drop-shadow. The pill toggle (Subscriptions/Wishlist, Cards/Banks, filter pills) uses `gradient-gold` for the active state and `bg-bg-surface border border-white/[0.06]` for inactive.

When writing hardcoded gold hex values (SVG stroke colors, inline styles) use `#D4AF37` — never the old amber `#f59e0b`.

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
- **Expense in a row**: `text-ink` (neutral, not colored)
- **Spent stat card**: `text-gold` — gold, not ruby (RORK color system: emerald = income, gold = spent)
- Use the unicode minus `−` (U+2212), never a hyphen `-`, before expense amounts

### Icon color rules

CategoryIcon `className` follows a three-way rule applied consistently across Home, Money, and Wallet:
- Income → `text-emerald`
- Subscription payment (expense name matches an active subscription name, case-insensitive) → `text-white/60`
- Regular expense → `text-gold`

Detection pattern (used in Home, Money, and Wallet): load `subscriptions.name` where `status = 'Active'` once on mount; build `new Set(names.map(n => n.toLowerCase()))`; check `subNames.has(tx.name.toLowerCase())`.

### Recurring layout patterns

**Card list** (transactions, subscriptions, etc.):
```tsx
<div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
```

**Icon cell — transactions** (expense/income rows, circle shape):
```tsx
<div className="w-10 h-10 rounded-full bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
  <CategoryIcon category={tx.category} type={tx.type} size={15}
    className={tx.type === 'Income' ? 'text-emerald' : isSub ? 'text-white/60' : 'text-gold'} />
</div>
```

**Icon cell — subscriptions** (rounded square):
```tsx
<div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
  <RefreshCw size={15} className="text-gold" strokeWidth={1.75} />
</div>
```

**Bottom sheet pattern**: fixed position, `translate-y-full` ↔ `translate-y-0` with `transition-transform duration-300`, `rgba(0,0,0,0.72)` backdrop, `rounded-t-[24px]` top corners, drag handle (`w-9 h-1 rounded-full bg-white/20`). Form state resets after close animation via `setTimeout(..., 300)` in a `useEffect` watching `open`.

**Critical iOS scroll rules for bottom sheets:**
- **Never** set `document.body.style.overflow = 'hidden'` — this breaks touch scroll on all children in iOS Safari
- Use a static handle+header block, then a separate scrollable `<div>` with **inline styles** (not Tailwind): `style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}`
- Outer sheet wrapper: `style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}`
- Wrap `<input type="date">` and `<input type="time">` in an `overflow-hidden` container div — iOS Safari native controls don't clip to `border-radius` otherwise
- Use `style={{ colorScheme: 'dark' }}` on date/time inputs (not Tailwind `[color-scheme:dark]`)

Every page root `<div>` should include `tab-enter` for the mount animation. Each route also has a `loading.tsx` that renders a skeleton instantly on navigation — keeps tab switches feeling instant while server data loads. Match the skeleton layout to the page's actual structure.

### Card styles & textures (`src/lib/cardStyles.ts`)

- `CARD_STYLE_DEFS: Record<CardStyle, CardStyleDef>` — 12 gradient styles (black, gold, green, platinum, sapphire, cobalt, graphite, ruby, midnight, rose, forest, obsidian), each with `gradient`, `chipFill`, `chipStroke`, `textPrimary`, `textMuted`
- `CARD_TEXTURE_DEFS: Record<CardTexture, { label }>` — 8 texture options: none, diamonds, slate, fractal, grid, chevron, carbon, topography
- `STYLE_GROUPS` — 4 named groups (Neutral, Blue, Green, Warm) used to organize the color picker UI
- Texture patterns are gold-tinted (`rgba(232,196,107,opacity)`) SVG `<pattern>` elements. `getTexturePattern` is defined inline in `CardVisual.tsx` (not in `cardStyles.ts`) since `.ts` files can't contain JSX.
- `cards` DB table has a `texture text not null default 'none'` column (added by migration `20260512_cards_style_texture_fix.sql`). That migration also runs `alter column style type text` to remove any check constraint on style values.

### Key utilities (`src/lib/utils.ts`)

- `$f(n)` — `$1,234` (whole dollars, rounds)
- `$fd(n)` — `$1,234` when whole, `$1,234.50` when cents are non-zero (use for transaction amounts)
- `$fc(n)` — `$12.50` (always with cents)
- `$fk(n)` — `$4.8K` (compact)
- `calcSubCosts(cost, billing)` — returns `{ monthly, annual }` matching the original app's exact multipliers
- `nextRenewalDate(from, billing)` — advances a date by one billing cycle
- `daysUntil(date)` / `daysUntilLabel(date)` — "in 3 days" / "today" / "2 days ago"
- `localToday()` — returns today as `YYYY-MM-DD` in `America/Los_Angeles`. **Always use this for any date written to the DB.** Never use `new Date().toISOString().slice(0, 10)` — that's UTC and will produce the wrong date for users in negative-offset timezones.
- `fmtDate(d)` / `fmtMonth(d)` — human-readable date/month strings
- `groupByMonth(rows)` — groups any `{ date: string }` array into `{ label, key, rows }[]` sorted newest-first
- `clamp(v, min, max)` — numeric clamp
- `cn(...classes)` — Tailwind className joiner
- `haptic(style)` — triggers `navigator.vibrate()` where supported (Android); silent on iOS. Styles: `'tap'` (6ms), `'confirm'` (10ms), `'delete'` (double-pulse). SwipeToDelete calls this automatically; call it manually on other destructive or confirming actions.

### PWA / home screen install

`src/app/manifest.ts` generates `/manifest.webmanifest` (Next.js built-in). `src/app/layout.tsx` sets `appleWebApp.capable: true` and `statusBarStyle: 'black-translucent'` so the app runs chrome-free when launched from the iPhone home screen.

Three icon files are expected in `hoardr/public/` (not yet committed — create and add them):
- `apple-touch-icon.png` — 180×180, used by Safari Add to Home Screen
- `icon-192.png` — 192×192, Android / manifest
- `icon-512.png` — 512×512, splash / maskable

To install on iPhone: Safari → Share → Add to Home Screen.

### Calendar page architecture

The calendar page (`calendar/page.tsx`) is a single client component with three views on a horizontal sliding rail:

```
viewIndex 0 → View 1: month grid  (phone) / Notion grid (iPad+)
viewIndex 1 → View 2: infinite vertical day list
viewIndex 2 → View 3: full-screen day detail (Timepage style)
```

The rail uses `transform: translateX(-${viewIndex * 100}vw)` with a 320ms cubic-bezier transition. All three panels are always mounted.

**Swipe navigation** — touch and mouse drag both supported (same 60px threshold + `|dx| > |dy| × 1.5`):
- V1 → V2: left swipe/drag. Sets `scrollToToday.current = true` + `suppressPrepend.current = true`.
- V2 → V1: right swipe/drag. Preserves View 2 scroll position.
- V2 row → V3: left swipe on a day row.
- V3 → V2: right swipe/drag. Preserves View 2 scroll (does NOT re-center today).

**Scroll-to-today (View 2)** — **never use `scrollIntoView`**: it silently fails inside `position: fixed` overflow containers on iOS WKWebView. Use manual `scrollTop`:
```typescript
const cRect = sc.getBoundingClientRect()
const eRect = el.getBoundingClientRect()
sc.scrollTop = sc.scrollTop + eRect.top - cRect.top - sc.clientHeight / 2 + eRect.height / 2
```
Fires 360ms after V1→V2 transition in a `useEffect` watching `viewIndex`.

**`suppressPrepend` ref**: the prepend IntersectionObserver fires immediately when View 2 enters at `scrollTop=0`, saving `prevH=0`. On iOS (slower renders) its double-`rAF` fires *after* the scroll-to-today, clobbering the position. Fix: set `suppressPrepend.current = true` before `setViewIndex(1)` in any swipe/drag handler; the prepend observer returns early if it's set; clear it after `scrollTop` is written.

**`months: MonthKey[]` state** — shared between View 2's infinite day list and the Notion month grid. Initial 9 months centered on today. View 2 has its own `topSentRef`/`botSentRef` IntersectionObservers (active only when `viewIndex === 1`). The Notion grid has `monthGridTopSentRef`/`monthGridBotSentRef` observers (active only when `isLargeScreen && calView === 'month'`).

**Large-screen calendar (≥768px)** — `isLargeScreen` boolean from a `resize` listener. View 1 shows a List/Month toggle in the header. `calView: 'list' | 'month'` is persisted to `localStorage`.

*Notion-style month grid* (month mode on large screens):
- **180px sidebar** (`#1a1a1a`, `borderRight: 1px solid #2a2a2a`): mini month navigator (`sidebarYear`/`sidebarMonth` state, independent from the main grid), per-type legend toggles (`hiddenTypes: Set<EventType>` local state — clicking hides that type from the grid only), Today button scrolls main grid to today, Add Calendar button → settings sheet.
- **Main grid** (`#0d0d0d`): sticky DOW header + scrollable `<div ref={monthGridRef}>` containing all `months` rendered as calendar month sections.
  - Each month section: sticky gold Big Shoulders label + week rows (7 cells, `minHeight: 80px`, `#2a2a2a` grid lines).
  - Event pills: `width: 3px` left colored border + optional short time prefix + truncated title.
  - `monthCellRefs: Map<string, HTMLElement>` — set in ref callbacks on current-month cells; used to scroll-to-day from the sidebar mini calendar or on entry to month mode.
  - `monthVisibleMap` = `visibleMap` additionally filtered by `hiddenTypes`.
- Clicking a day cell opens `AddEventSheet` directly (stays on View 1, no navigation to View 3).
- Clicking a day in the sidebar mini calendar scrolls `monthGridRef` to that cell using the same `getBoundingClientRect()` pattern.

**Finance events** are merged into a unified `CalEvent[]` type: `type: 'expense' | 'income' | 'sub' | 'custom' | 'google'`. Dot/bar colors: gold = expense, emerald = income, ruby = sub, violet = custom, blue = Google. Google events use their own `color` field from the calendar API.

**Weather** — Open-Meteo 14-day forecast (no key, free). Fetched once on mount via geolocation; stored in `weatherMap: Record<string, DayWeather>`. View 3 renders day-specific weather at the bottom. Weather icons are Lucide: `Sun`, `CloudSun`, `Cloud`, `CloudFog`, `CloudDrizzle`, `CloudRain`, `CloudSnow`, `CloudLightning`.

### FAB pattern

The add (`+`) button on all six tabs (Home, Money, Plans, Wallet, Studio, Calendar) is a circular gold FAB fixed at `right: 16px, bottom: 80px` (8px above the 72px nav bar). It is rendered outside the scrolling content `<div>` (after the closing tag) but inside the page's fragment wrapper. Styling:

```tsx
<button
  onClick={() => setSheetOpen(true)}
  className="fixed gradient-gold rounded-full flex items-center justify-center text-white font-light select-none"
  style={{ right: 16, bottom: 80, width: 56, height: 56, fontSize: 28, zIndex: 40,
           boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.25)' }}
  aria-label="Add"
>+</button>
```

`z-40` keeps it below bottom sheets (`z-[60]`) and below the nav (`z-50`). Do not use a top-right header button for add actions — the FAB is the established pattern.

### Studio commission flow

Status transitions: `Pending → Approved → In Progress → Completed → Paid`

- **Approve**: creates a Google Calendar event (store `cal_event_id` on the commission row)
- **Mark Paid**: creates an `income` row with `source: 'Freelance'` and `commission_id` pointing back; sets `commissions.income_id` and `paid_at`

The Google Calendar integration is proxied through `src/app/api/calendar/route.ts` (keeps credentials server-side). Direct gapi calls from the client are not used in the new app.

`AddEventSheet` accepts `googleCals?: GCalendar[]` and renders a native `<select>` dropdown for choosing which calendar to create the event in. The calendar page filters this list to only calendars enabled in settings (`prefs.googleCalendarIds`). The selected `calendarId` is passed to `createCalEvent()` which forwards it to the API route.
