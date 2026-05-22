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
| `/settings` | Accounts (→ /wallet), Appearance (theme picker), App (sign out) |
| `/calendar` | Compact month grid (phone) / Notion-style infinite grid with sidebar (iPad+) |
| `/studio` | Commission desk — Pending → Approved → In Progress → Completed → Paid flow |

`/wallet` (Card visuals 12 styles + 8 textures, Banks) is accessible via Settings → Accounts → Cards & Banks, not in the nav directly.

### Data model

Supabase Postgres tables (schema lives in `supabase/migrations/`): `categories`, `banks`, `cards`, `expenses`, `wishlist`, `subscriptions`, `income`, `commissions`. A read-only `ledger` view unions expenses + income + subscription payments.

Key invariants carried over from the original app:
- `expenses.savings` is a **generated column**: `coalesce(original_cost, cost) - cost`
- `subscriptions.monthly_cost` and `annual_cost` are **stored** (not derived at read time) — recompute and write on every subscription save using `calcSubCosts()` in `src/lib/utils.ts`
- Income is a **first-class table** (not mixed into a master ledger). The `ledger` view provides the unified read layer
- `commissions.cal_event_id` is set when a commission is Approved (creates a Google Calendar event); cleared and recreated on deadline changes
- `wishlist_status` enum includes `'Ordered'` (added by migration `20260518_wishlist_ordered.sql`); `wishlist.ordered_at text` stores the purchase date. Do **not** spread non-existent columns into wishlist updates — the table has no `expense_id` column.
- `cal_events` has three recurrence columns (added by migration `20260519_cal_events_recurrence.sql`): `recurrence_rule text` (RRULE string without the `RRULE:` prefix), `recurrence_exceptions text[] default '{}'` (dates to skip, `YYYY-MM-DD`), `recurrence_parent_id uuid references cal_events(id)` (unused for now; reserved for future child rows).

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

- `nav/BottomNav.tsx` — 6-tab fixed nav, 72px tall; active state via `usePathname()`. Tabs: Home, Money, Plans, Settings, Calendar, Studio.
- `ui/ThemeToggle.tsx` — exports `ThemeToggle` (gear icon button, kept for any standalone use) and `SignOutButton`. Imports all theme logic from `@/lib/theme` — do not re-define `Theme`, `THEMES`, `applyTheme`, or `readTheme` locally. The full theme picker UI now lives on the `/settings` page.
- `ui/Pill.tsx` — exports `Pill` (single) and `PillGroup<T>` (segmented control with gold active state)
- `ui/CategoryIcon.tsx` — exports `CategoryIcon` (React component) and `getCategoryIcon` (returns a `LucideIcon`). Maps real Google Sheets category names (`Food`, `Fun`, `Tesla`, `Apparel`, `Tech`, `Home`, `Health`, `Travel`, `PC`, `Life`, `Gift`, `Insurance`, `Stocks`, `Other`, `Subscriptions` for expenses; `Repayment`, `Refund`, `Freelance`, `Projects`, `Stocks`, `Other` for income). Pass `className` to color the icon — use `text-gold` for expenses, `text-emerald` for income.
- `ui/SwipeToDelete.tsx` — swipe-left-to-delete with optional `onTap` (fires on clean tap when not swiped/revealed), `actionLabel`, and `actionBg` props. The `actionBg` default is `bg-ruby`; pass `'bg-amber-500'` for a cancel/restore action. Also accepts `onRight` / `rightLabel` / `rightBg` for a right-swipe confirm action (e.g. pay). Includes automatic press-scale animation (97%) and haptic feedback — no configuration needed.
- `money/AddTransactionSheet.tsx` — canonical bottom sheet implementation; exports `CardOption` and `BankOption` interfaces used by all pickers
- `money/EditTransactionSheet.tsx` — edit existing transaction; exports `TxEdits`
- `plans/AddSubscriptionSheet.tsx` / `EditSubscriptionSheet.tsx` — exports `NewSub` / `SubEdits`
- `plans/AddWishlistSheet.tsx` / `EditWishlistSheet.tsx` — exports `WishEdits`
- `wallet/CardVisual.tsx` — renders a credit card from a `Card` prop using `CARD_STYLE_DEFS`; draws SVG texture overlay from `getTexturePattern` (defined inline); use this everywhere a card is displayed. Accepts optional `expenseCount?: number` and `subCount?: number` props — displayed bottom-left of the card face. The Wallet page computes these from the `expenses` and `subscriptions` tables (filtered by `card_id`) and passes them in.
- `wallet/AddCardSheet.tsx` / `EditCardSheet.tsx` — card add/edit sheets with grouped 12-style color picker and 8-texture picker; `NewCard` and `CardEdits` interfaces both include `texture: CardTexture`
- `calendar/RecurrencePicker.tsx` — bottom sheet for choosing/building a recurrence rule. Props: `{ open, date, value, onClose, onChange }`. Two views: preset list (7 options derived from the event date via `makePresets(dateStr)`) and a custom builder (frequency chips, interval stepper, weekday toggles, end condition). Renders at `z-[70]` above AddEventSheet/EditEventSheet (`z-[60]` backdrop).
- `calendar/EditEventSheet.tsx` — edit an existing custom calendar event. Exports `EditableEvent` (the event to edit), `EventEdits` (the patch), and `RecurrenceScope = 'this' | 'following' | 'all'`. Two-step flow: a scope picker (shown only when `event.recurrenceRule` is set) then the full edit form matching AddEventSheet. Delete button opens a scope confirmation sheet at `z-[60]`/`z-[70]`.

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

**Swipe-down dismiss + background scroll lock (canonical pattern for all non-calendar sheets):**

Three-layer lock used in every sheet (`AddTransactionSheet`, `EditTransactionSheet`, all plans/wallet sheets):

```typescript
const sheetRef    = useRef<HTMLDivElement>(null)
const dragStartY  = useRef<number | null>(null)
const scrollAreaRef = useRef<HTMLDivElement>(null)

// Triple-lock: body position, html overscroll, direction-aware touchmove
useEffect(() => {
  if (!open) return
  const scrollY = window.scrollY
  document.body.style.position = 'fixed'
  document.body.style.top = `-${scrollY}px`
  document.body.style.width = '100%'
  document.documentElement.style.overscrollBehavior = 'none'
  let lastY = 0
  const onStart = (e: TouchEvent) => { lastY = e.touches[0].clientY }
  const onMove = (e: TouchEvent) => {
    const el = scrollAreaRef.current
    if (!el?.contains(e.target as Node)) { e.preventDefault(); return }
    const dy = e.touches[0].clientY - lastY
    lastY = e.touches[0].clientY
    const { scrollTop, scrollHeight, clientHeight } = el
    if ((scrollTop <= 0 && dy > 0) || (scrollTop + clientHeight >= scrollHeight - 1 && dy < 0)) e.preventDefault()
  }
  document.addEventListener('touchstart', onStart, { passive: true })
  document.addEventListener('touchmove', onMove, { passive: false })
  return () => {
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    document.documentElement.style.overscrollBehavior = ''
    document.removeEventListener('touchstart', onStart)
    document.removeEventListener('touchmove', onMove)
    window.scrollTo(0, scrollY)
  }
}, [open])

// Swipe-down dismiss — direct DOM mutation (no re-renders during drag)
function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
function onDragMove(e: React.TouchEvent) {
  if (dragStartY.current === null || !sheetRef.current) return
  const dy = Math.max(0, e.touches[0].clientY - dragStartY.current)
  sheetRef.current.style.transform = `translateY(${dy}px)`
  sheetRef.current.style.transition = 'none'
}
function onDragEnd(e: React.TouchEvent) {
  if (!sheetRef.current) return
  const dy = dragStartY.current !== null ? Math.max(0, e.changedTouches[0].clientY - dragStartY.current) : 0
  dragStartY.current = null
  if (dy > 80) {
    sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
    sheetRef.current.style.transform  = 'translateY(100%)'
    setTimeout(() => {
      if (sheetRef.current) { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' }
      onClose()
    }, 280)
  } else {
    sheetRef.current.style.transform = ''
    sheetRef.current.style.transition = ''
  }
}
```

JSX structure — `ref={sheetRef}` on sheet, `ref={scrollAreaRef}` on the scrollable content div, drag handlers on handle:
```tsx
<div
  ref={sheetRef}
  className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', open ? 'translate-y-0' : 'translate-y-full')}
  style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
>
  <div onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
    className="flex justify-center pt-3 pb-3" style={{ touchAction: 'none' }}>
    <div className="w-9 h-1 rounded-full bg-white/20" />
  </div>
  ...header...
  <div ref={scrollAreaRef} className="px-5 space-y-5 overflow-y-auto"
    style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>
    ...form fields...
  </div>
</div>
```

The Tailwind `translate-y-0/full` classes handle open/close; direct DOM mutation handles mid-drag. On dismiss, inline styles are cleared inside the `setTimeout` callback *before* `onClose()` fires so the next open doesn't start with a stale transform.

**`usePullToRefresh` + body-lock interaction (iOS):** The hook skips activation when `document.body.style.position === 'fixed'`. This is essential — when any sheet is open, the body is fixed (scrollY = 0 always), so every downward swipe inside the sheet would otherwise trigger the pull indicator and snap back. Do not remove this guard from the hook.

**Critical iOS scroll rules for bottom sheets:**
- **Never** set `document.body.style.overflow = 'hidden'` — breaks touch scroll on all children in iOS Safari
- Use a static handle+header block, then a separate scrollable `<div ref={scrollAreaRef}>` with **inline styles** (not Tailwind): `style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}`
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
- `cards.sort_order int` controls card ordering. The Wallet page uses **long-press drag-to-reorder** (450ms timer, `haptic('tap')` on activation, native touch listeners with `passive: false` to block iOS scroll during drag, `flushSync` from `react-dom` for synchronous order updates, `sort_order` batch-written on touchend). There is no Reorder button — do not re-add one.

### RRULE expansion (`src/lib/rrule.ts`)

- `expandRRule(rule, baseDate, rangeStart, rangeEnd, exceptions?)` — expands an RRULE string (without the `RRULE:` prefix) into an array of `YYYY-MM-DD` date strings within the given range, skipping any dates in `exceptions`. Supports: DAILY, WEEKLY (with BYDAY ordinals), MONTHLY (BYMONTHDAY, BYSETPOS+BYDAY, ordinal BYDAY), YEARLY; plus INTERVAL, UNTIL, COUNT.
- `rruleLabel(rule, baseDate)` — returns a human-readable summary, e.g. `"Every week (on Tuesday)"`.
- Calendar `loadData` expands recurring events over a **fixed ±3 year window** (`now.getFullYear() - 1` → `now.getFullYear() + 2`), computed fresh on every load — not tied to the scroll position of months/notionWeeks. **Postgres `TIME` columns** (`start_time`, `end_time`) are returned as `'HH:MM:SS'` by PostgREST — `loadData` slices them to 5 chars (`.slice(0, 5)`) before use; any regex expecting `HH:MM` will silently fail on unsliced values. **Cross-midnight events** (where `end_time < start_time`) are pushed to **both** the start date and the next day, both entries carrying `instanceDate = baseDate` so editing from either cell opens the correct start date/time:
  ```typescript
  if (rrule) {
    for (const instanceDate of expandRRule(rrule, baseDate, expandStart, expandEnd, exceptions)) {
      push(instanceDate, { ...base, instanceDate })
      if (isCrossMidnight) push(nextDayOf(instanceDate), { ...base, instanceDate })
    }
  } else {
    push(baseDate, { ...base, instanceDate: baseDate })
    if (isCrossMidnight) push(nextDayOf(baseDate), { ...base, instanceDate: baseDate })
  }
  ```
  Each expanded instance carries `instanceDate` (the actual occurrence date) on the `CalEvent` object; the `date` field retains the original base date of the parent row.

### Theme system (`src/lib/theme.ts`)

Shared module — import from here, never re-define locally:
- `Theme` type: `'obsidian' | 'charcoal-slate' | 'cool-linen'`
- `THEMES: ThemeDef[]` — array of 3 theme definitions with `id`, `label`, `subtitle`, `swatches`
- `applyTheme(t)` — sets html class, colorScheme, background, meta theme-color, localStorage
- `readTheme()` — reads localStorage, returns `'obsidian'` as default

CSS variables per theme live in `globals.css` under `:root`, `html.charcoal-slate`, `html.cool-linen`. Inline React `style={{}}` props should use `var(--color-bg-base/surface/elevated/ink/grid-border)` (solid `rgb()` string helpers) or `rgb(var(--rgb-X) / alpha)` for opacity variants. Never hardcode dark-mode hex colors (`#0A0A0B`, `#1c1c2a`, etc.) in inline styles — they break the light themes.

`src/app/layout.tsx` includes a pre-render inline script that applies the stored theme class and background before React hydrates, preventing a flash.

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

The calendar page (`calendar/page.tsx`) is a single client component with two panels on a horizontal sliding rail:

```
viewIndex 0 → Panel 0 (mobile):  Fantastical split view — compact month grid + day list
              Panel 0 (iPad+):   Notion-style infinite grid with sidebar
viewIndex 1 → Panel 1:           Full-screen day detail (Timepage style)
```

The rail uses `transform: translateX(-${viewIndex * 100}vw)` with a 320ms cubic-bezier transition. Both panels are always mounted. `viewIndex` type is `0 | 1`.

**Mobile Panel 0 — Fantastical split view:**
- `const GRID_EXPANDED = 280` (module-level px constant) — max height of the compact month grid
- `gridH: number` state — current grid height (0 to `GRID_EXPANDED`). Start at `GRID_EXPANDED`.
- `isDraggingHandle: boolean` state — suppresses the CSS height transition during active drag for immediate feedback
- **Drag handle**: sits between grid and list. Tap = toggle collapsed/expanded. Drag up/down adjusts `gridH` live; on `touchEnd` snaps to 0 or `GRID_EXPANDED` based on `> GRID_EXPANDED / 2` threshold.
- **Grid month navigation**: swipe left/right on the compact grid (`gridSwipe` ref) calls `goToNext()`/`goToPrev()` — same 40px threshold, `|dx| > |dy| × 1.5`.
- **Day tap**: tapping a cell in the compact grid sets `gridSel` (the highlighted day) and scrolls the list to that day using manual `scrollTop` (never `scrollIntoView`).
- **Gold vertical month label**: visible only when `viewIndex === 0 && gridH === 0` (grid fully collapsed). Double-tap scrolls list to today.
- `gridSel: string` state — the currently selected/highlighted day in the compact grid; used to pre-fill the FAB's AddEventSheet default date.

**Swipe navigation** — touch and mouse drag both supported (60px threshold, `|dx| > |dy| × 1.5`):
- Day row → Panel 1: left swipe on a day row sets `setViewIndex(1)`
- Panel 1 → Panel 0: right swipe/drag sets `setViewIndex(0)`. Preserves list scroll (does NOT re-center today).

**Scroll-to-today** — **never use `scrollIntoView`**: silently fails inside `position: fixed` overflow containers on iOS WKWebView. Use manual `scrollTop`:
```typescript
const cRect = sc.getBoundingClientRect()
const eRect = el.getBoundingClientRect()
sc.scrollTop = sc.scrollTop + eRect.top - cRect.top - sc.clientHeight / 2 + eRect.height / 2
```
Runs once on mount (500ms delay) via a `useEffect` with `[todayStr]` deps. Also called by `scrollListToToday()` named helper (used by double-tap on month label / gold vertical label).

**`suppressPrepend` ref**: the prepend IntersectionObserver fires at `scrollTop=0` on initial mount, saving `prevH=0`. On iOS its double-`rAF` can fire *after* the initial scroll-to-today, clobbering the position. The prepend observer returns early if `suppressPrepend.current` is set; it's cleared after `scrollTop` is written.

**`months: MonthKey[]` state** — drives the infinite day list in Panel 0 (mobile). Initial 9 months centered on today. `topSentRef`/`botSentRef` IntersectionObservers are active only when `!isLargeScreen` (iPad uses Notion grid, not this list).

**`notionWeeks: string[]` state** — used exclusively by the Notion month grid on large screens. Array of Sunday date strings (`YYYY-MM-DD`), initialized to 48 weeks centered on today's Sunday. `monthGridTopSentRef`/`monthGridBotSentRef` IntersectionObservers (active only when `isLargeScreen && calView === 'month'`) append/prepend **8 weeks at a time** via `addWeeks(weekStart, n)` helper. `notionWeeksRef` syncs on every change (same pattern as `monthsRef`).

Module-level date helpers: `addWeeks(weekStart, n)` advances a Sunday date string by `n` weeks using local `new Date(y, m-1, d + n*7)` (never UTC). `weekDays(weekStart)` returns 7 date strings for Sun–Sat of that week.

**Large-screen calendar (≥768px)** — `isLargeScreen` boolean from a `resize` listener. Panel 0 shows a List/Month toggle in the header. `calView: 'list' | 'month'` is persisted to `localStorage`.

*Notion-style month grid* (month mode on large screens):
- **180px sidebar** (`#1a1a1a`, `borderRight: 1px solid #2a2a2a`): mini month navigator (`sidebarYear`/`sidebarMonth` state, independent from the main grid), per-type legend toggles (`hiddenTypes: Set<EventType>` local state — clicking hides that type from the grid only), Today button scrolls main grid to today, Add Calendar button → settings sheet.
  - **Per-type color customization** (`typeColors: Partial<Record<EventType, string>>`, persisted to `localStorage` key `'cal-type-colors'`): each legend row has a `<label>` wrapping the color dot + a hidden `<input type="color">` — clicking the dot opens the native color picker. A ✕ reset button appears next to the dot when a custom color is set. These overrides only affect Notion grid rendering (not Views 2/3).
  - `notionColor(ev: CalEvent) => string` — inline helper: `ev.color ?? typeColors[ev.type] ?? DOT_COLOR[ev.type]`. Used for all pill/dot colors inside Notion grid cells.
- **Main grid** (`#0d0d0d`): sticky DOW header + scrollable `<div ref={monthGridRef}>` containing a **single continuous week-based grid** — `notionWeeks.map(weekStart => ...)` with no month section breaks, no sticky month labels.
  - Each row: one week (`position: relative`, CSS Grid `repeat(7,1fr)`, `borderBottom: 1px solid #2a2a2a`, `minHeight: 140`).
  - When a cell's day is `1` (first of month), an inline gold month abbreviation appears to the left of the date number.
  - All event pills (all-day colored bars and timed/financial rows) are **18px tall**. Show up to 4 events per cell + `+N more` overflow.
  - `monthCellRefs: Map<string, HTMLElement>` — set for every cell (no `current` filter needed); used to scroll-to-day from the sidebar or on entry to month mode.
  - `monthVisibleMap` = `visibleMap` additionally filtered by `hiddenTypes`.
- Clicking a day cell opens `AddEventSheet` directly (stays on Panel 0, no navigation to Panel 1).
- Clicking a day in the sidebar mini calendar scrolls `monthGridRef` to that cell using the same `getBoundingClientRect()` pattern.
- Custom and Google event pills in grid cells are fully clickable (`onClick` + `e.stopPropagation()` so the parent cell's add-new handler doesn't fire); clicking calls `handleOpenEdit(ev)` which opens `EditEventSheet`. Financial event pills (expense/income/sub) have no `id` and are not interactive.

**`DayEventCard`** (inline component in `calendar/page.tsx`) renders individual event pills in the day list and day detail (Panel 1). It accepts `onEdit: (ev: CalEvent) => void` and shows a pencil button for custom events. Tapping trash on a recurring custom event routes to `deleteScopeEv` state (shows the scope picker) rather than deleting immediately.

**Finance events** are merged into a unified `CalEvent[]` type: `type: 'expense' | 'income' | 'sub' | 'custom' | 'google'`. Dot/bar colors: gold = expense, emerald = income, ruby = sub, violet = custom, blue = Google. Google events use their own `color` field from the calendar API. Custom events additionally carry:
- `recurrenceRule?: string` — the RRULE string (no `RRULE:` prefix) from the DB row
- `instanceDate?: string` — the actual date of this occurrence after expansion (equals `date` for non-recurring events)

**Recurring event edit/delete scopes** — `RecurrenceScope = 'this' | 'following' | 'all'`. The scope picker is shown in `EditEventSheet` and the delete confirmation sheet whenever the event has a `recurrenceRule`.
- `'this'` — adds `instanceDate` to `recurrence_exceptions` on the parent row (optimistic: removes the instance from `visibleMap`)
- `'following'` — truncates the parent rule by setting `UNTIL=<day before instanceDate>` (optimistic: removes all instances on or after that date)
- `'all'` — deletes the parent row entirely (optimistic: removes all instances)
All three use the deferred-delete toast pattern so the user gets a 5-second Undo.

**Weather** — Open-Meteo 14-day forecast (no key, free). Fetched once on mount via geolocation; stored in `weatherMap: Record<string, DayWeather>`. Panel 1 (day detail) renders day-specific weather at the bottom. Weather icons are Lucide: `Sun`, `CloudSun`, `Cloud`, `CloudFog`, `CloudDrizzle`, `CloudRain`, `CloudSnow`, `CloudLightning`.

### FAB pattern

The add (`+`) button on tabs that have addable content (Home, Money, Plans, Wallet, Studio, Calendar) is a circular gold FAB fixed at `right: 16px, bottom: 80px` (8px above the 72px nav bar). The Settings page has no FAB. It is rendered outside the scrolling content `<div>` (after the closing tag) but inside the page's fragment wrapper. Calendar is the only tab with two FABs — one in Panel 0 (mobile split view, pre-fills `gridSel`) and one in Panel 1 (day detail, pre-fills `selectedDay`); both are conditionally rendered by panel. Styling:

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

`AddEventSheet` accepts `googleCals?: GCalendar[]` and renders a native `<select>` dropdown for choosing which calendar to create the event in. The calendar page filters this list to only calendars enabled in settings (`prefs.googleCalendarIds`). The selected `calendarId` is passed to `createCalEvent()` which forwards it to the API route. The `EMPTY` form state defaults `allDay: false` — new events open with time pickers visible.

`NewCalEvent` includes `recurrenceRule: string` (empty string = no recurrence). `AddEventSheet` renders a **Repeat** row (between time pickers and location) that opens `RecurrencePicker` and displays the human-readable label from `rruleLabel()`. When saving, `handleAddEvent` in `calendar/page.tsx` stores the rule in `cal_events.recurrence_rule` and passes `recurrence: ['RRULE:' + rule]` to the Google Calendar API.

`GCalEvent` (in `src/lib/calendar.ts`) includes `recurrence?: string[]` for the Google Calendar recurring-event field. `timedEvent()` in that file auto-detects cross-midnight events (`endTime < startTime`) and advances the GCal end `dateTime` to the next calendar day — always use `timedEvent()`, never build GCal `dateTime` strings by hand.

**`CalendarSettingsSheet`** (`CalPrefs`) includes `googleCalendarColors?: Record<string, string>` (calendarId → hex override). In the Google Calendars list, each row's color dot is a `<label>` wrapping a hidden `<input type="color">` — clicking the dot opens the native picker and stores the override in `local.googleCalendarColors`. A ✕ reset button appears when `isCustom`. These overrides are stored in `profiles.calendar_prefs` (Supabase) and apply to Google event rendering in all views.
