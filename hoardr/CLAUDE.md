# hoardr architecture

## Routing and auth

Next.js 15 App Router, two route groups:
- `(auth)/login` — public Google OAuth sign-in
- `(dashboard)/*` — protected; all six tabs share `BottomNav` shell

`middleware.ts` guards every route (unauthenticated → `/login`; logged-in on `/login` → `/home`; `/` → one or the other).

## Six tabs

| Route | Label | Feature |
|---|---|---|
| `/home` | Hoard | Net worth hero, sparkline, upcoming bills, recent activity |
| `/money` | Out | 30-day bar chart + expense/income feed with filter |
| `/in` | In | Income list + Cards + Banks (three-tab PillGroup) |
| `/calendar` | Calendar | Compact month grid (phone) / Notion-style infinite grid (iPad+) |
| `/studio` | Studio | Commission desk — Pending → Approved → In Progress → Completed → Paid |
| `/settings` | Settings | Appearance, Calendar filters, Defaults, Sign out |

`/wallet` and `/plans` redirect to `/in`.

**`/in` page** — three PillGroup tabs (`History | Streams | Accounts`). History: income rows filtered `date <= today`. Streams: `revenue_streams` table + bank interest streams; `autoGenerateStreams(userId, streams)` runs once per session (`let sessionAutoGenDone = false` guard) inserting income rows for each due stream and advancing `next_pay_date`. Accounts: bank list + card visuals with long-press drag-to-reorder.

**`/settings/categories`** — probes for `icon/color/tx_type` columns on load; shows SQL migration prompt if missing. After probe: upserts builtins (`ignoreDuplicates: true`), then batch-UPDATEs rows still on migration-default icon (`LayoutGrid`) to apply curated icon/color — preserves user customizations.

**`/settings/defaults`** — default card (`cards.is_default`), bank, expense category, billing cycle via `AppPrefs` in `src/lib/app-prefs.ts`.

## Data model

Tables (schema in `supabase/migrations/`): `categories`, `banks`, `cards`, `expenses`, `wishlist`, `subscriptions`, `income`, `commissions`. `ledger` view unions expenses + income + subscription payments.

Key invariants:
- `expenses.savings` is a **generated column**: `coalesce(original_cost, cost) - cost`
- `subscriptions.monthly_cost` / `annual_cost` are **stored** — recompute with `calcSubCosts()` on every subscription save
- Income is a **first-class table**, not mixed into ledger
- `commissions.cal_event_id` set on Approve; cleared and recreated on deadline changes
- `wishlist_status` enum includes `'Ordered'`; `wishlist.ordered_at text` stores purchase date. **No `expense_id` column** — don't spread it into wishlist updates.
- `cal_events` recurrence columns: `recurrence_rule text` (RRULE without prefix), `recurrence_exceptions text[] default '{}'`, `recurrence_parent_id uuid` (reserved)

## Supabase clients

Two clients — never swap:
- `src/lib/supabase/client.ts` — browser (`'use client'` components)
- `src/lib/supabase/server.ts` — server components and API routes (cookie-aware, async)

## Async safety pattern (required on every `'use client'` page)

Rapid tab switching causes in-flight queries to resolve after unmount → Safari WKWebView crashes. Every client page must guard with a generation counter + AbortController. Canonical example: `home/page.tsx`. Pattern: `loadGen = useRef(0)`, `abortRef = useRef<AbortController|null>(null)`, increment gen and abort on each call, discard result if `gen !== loadGen.current`. Cleanup: `return () => { loadGen.current++; abortRef.current?.abort() }`. Second data fetch (e.g. detail) needs a separate `detailGen` + `detailAbortRef`.

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

## Data phase

All tabs use live Supabase. `src/lib/data/transactions.ts` exists only as a type source — `SEED_TRANSACTIONS` is unused and can be deleted.

## UI components (`src/components/`)

- `nav/BottomNav.tsx` — 6-tab fixed nav, 72px tall. Order: Hoard/Out/In/Calendar/Studio/Settings. Active = 2px sliding gold bar at **top** of nav, no dot below. `text-gold` active.
- `nav/TabSwipeNavigator.tsx` — mounted in layout. 35px edge swipe → prev/next tab. `EXCLUDED = ['/calendar', '/money', '/in']`. Guards against open sheets (`body.style.position === 'fixed'`). Constants: `EDGE_PX=35`, `MIN_DX=60`, `H_RATIO=1.5`.
- `hooks/usePillSwipe.ts` — used by `/money` and `/in`. Internal pill switching + cross-route edge navigation. Same constants. Guards against sheets.
- `ui/ThemeToggle.tsx` — imports theme from `@/lib/theme`, never re-define locally. Full theme picker lives on `/settings`.
- `ui/Pill.tsx` — `Pill` (single) and `PillGroup<T>` (segmented, gold active)
- `ui/CategoryIcon.tsx` — checks `categoryMeta[name]` first (DB icon/color), then hardcoded defaults. `text-gold` expenses, `text-emerald` income. DB color applied via inline `style={{ color }}`, overriding Tailwind.
- `ui/SwipeToDelete.tsx` — swipe-left-to-delete; `onTap` fires on clean tap only; `actionBg` default `bg-ruby`. `onRight`/`rightLabel`/`rightBg` for right-swipe confirm. Press-scale + haptic built in.
- `money/AddTransactionSheet.tsx` — canonical bottom sheet; exports `CardOption`, `BankOption`
- `money/EditTransactionSheet.tsx` — exports `TxEdits`
- `wallet/RevenueStreamSheet.tsx` — `RevenueStreamConfig: { id, name, amount, freq, bankId, nextPayDate }`. Frequencies: `Weekly|Biweekly|Semimonthly|Monthly`. **No DB ops** — calls `onDone(config)` synchronously.
- `wallet/ManualDepositSheet.tsx` — one-off income deposit, used on `/in`
- `wallet/CardVisual.tsx` — renders card from `Card` prop using `CARD_STYLE_DEFS`. `getTexturePattern` inline (JSX). Accepts `expenseCount?`, `subCount?`.
- `wallet/AddCardSheet.tsx` / `EditCardSheet.tsx` — 12-style color picker, 8-texture picker; both include `texture: CardTexture`
- `ui/SemanticColorSheet.tsx` — accent color customization (Income/Expense/Subs). `react-colorful`. Flat + gradient builder views. `setSemanticColors()` dispatches `sem-colors-changed`.
- `calendar/RecurrencePicker.tsx` — recurrence rule sheet, `z-[70]`. Props: `{ open, date, value, onClose, onChange }`. Preset list + custom builder.
- `calendar/EditEventSheet.tsx` — iPhone sheet for create/edit. `EditableEvent.id` optional (no id = create mode). Two-step flow: scope picker → form. Cross-midnight: auto-bumps `endDate` +1 when `endTime < startTime`. Exports `EditableEvent`, `EventEdits`, `RecurrenceScope`.
- `calendar/LocationPickerSheet.tsx` — `z-[55]`. Sections: Favorites (localStorage), Recents (last 10), Google Places suggestions (200ms debounce). Back arrow → EditEventSheet.
- `calendar/CalendarPopover.tsx` — Notion-style popover for large screens. Falls back to centered modal on iPhone (`anchorRect === null`). Desktop: `position: fixed` time dropdowns at `z-202`, calendar dropdown at `z-201`. Places: use `defaultValue` (not `value`) — Places mutates DOM directly.

**Wallet sub stats** match expenses to subs by case-insensitive name via `Set`. Name mismatch silently drops payments.

- `home/HomeHero.tsx` — sparkline card. Two-panel sliding rail (month/year). `gestureMode` ref shared with SparkCharts to coordinate horizontal flick (swiping) vs long-press (scrubbing). `annualPoints` use `'Jan'…'Dec'` as `day` field.
- `home/SparkChart.tsx` — three series (inc/exp/sub), daily amounts not cumulative. Gradients use `gradientUnits="userSpaceOnUse"`. Hover dots are `<div>` not SVG `<circle>` (avoids oval distortion). Fill colors read via `getComputedStyle` (not inline `var()` — WebKit SVG). Listens for `sem-colors-changed`. Touch via native `addEventListener` with `{ passive: false }`; 300ms long-press → scrub.
- `home/HoardChest.tsx` — animated SVG savings fill. **Currently commented out.**
- `home/UpcomingBills.tsx` — right-swipe pays, left-swipe cancels.

## Card / bank picker pattern

Styled `<select>` dropdown with `style={{ colorScheme: 'dark' }}`. Sort so default appears first. Load wallet data in a **separate** `useEffect` (not inside `loadData`). `AddTransactionSheet` accepts `defaultCardId` / `defaultBankId`; pass from `getAppPrefs()`.

## Tap-to-edit pattern

Wrap rows in `<SwipeToDelete onTap={() => setEditTarget(row)}>`. `onTap` fires only on clean taps.

## Inline hero components (defined in-file, not extracted)

- `DailyBarChart` (money page) — 30-day net bars, RAF height transition, emerald/gold/zero colors, gold dot today
- `CategoryPillBar` (money page) — 32px animated pill bar. Track `#1C2A36`, fill gold gradient. Staggered entrance. Wide (>50%) renders content inside fill; narrow renders amount outside.
- `IncomeBarChart` (in page) — 6-month bars using `rgba(--sem-income-rgb, opacity)`. Listens to `sem-colors-changed`.
- `StatCard` (in page) — `SlotNumber` stat tile. History: This Month / This Year / Next In. Streams: Per Month / Per Year. Accounts: Total Saved / Int Per Year.

## Design system

Tailwind custom theme in `tailwind.config.ts`:

| Token | Value | Use |
|---|---|---|
| `bg-base` | `#080810` | page background |
| `bg-surface` | `#0f0f1a` | cards |
| `bg-overlay` | `#1c1c2a` | icon backgrounds, popovers |
| `gold` | `#D4AF37` | active nav, accents, positive amounts |
| `gold.light` | `#F7DF9E` | gradient start |
| `gold.dark` | `#A47F23` | gradient end |
| `emerald` | `#22c55e` | income, positive deltas |
| `ruby` | `#ef4444` | expenses, overdue, destructive |
| `ink` | `#f0f0f8` | primary text |
| `ink-muted` | `#7a7a9a` | secondary text |
| `ink-faint` | `#45455a` | labels, placeholders |

Fonts: `--font-montserrat` → `font-sans` + `font-mono` (all UI). `--font-big-shoulders` → display numerics only, always via `style={{ fontFamily: 'var(--font-big-shoulders)' }}`.

Utility classes in `globals.css`: `gradient-gold`, `gradient-emerald`, `glass`, `glow-green/gold/ruby`, `tab-enter`, `skeleton`.

Hardcoded gold hex: always `#D4AF37`, never `#f59e0b`.

**Semantic colors** — `text-emerald`/`text-gold` map to `var(--sem-income)`/`var(--sem-expense)`. When a gradient accent is set, `-webkit-text-fill-color: transparent` is added, which **inherits into children**. Any scroll-clipped text component (like `SlotNumber`) must reset `WebkitTextFillColor: 'currentColor'` on its innermost span.

**Inline styles** — use CSS variables (`var(--color-bg-base)`, `rgb(var(--rgb-X) / alpha)`), never hardcode dark hex like `#0A0A0B` or `#1c1c2a` — breaks light themes.

## Typography conventions

| Element | Classes |
|---|---|
| Page eyebrow | `text-[10px] font-medium tracking-[0.14em] uppercase text-gold` |
| Page title | `text-[32px] font-bold tracking-[-0.04em] text-ink` |
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

Build `new Set(subNames.map(n => n.toLowerCase()))` from `subscriptions` where `status = 'Active'` on mount. When `IconColorMode = 'category'`, use DB-stored color via `categoryMeta` instead. Toggle on Settings. Use `getIconColorMode()` / `setIconColorMode()`.

## Touch gesture coordination (`gestureMode` ref)

Shared `MutableRefObject<'undecided'|'swiping'|'scrubbing'>` between parent (swipe-to-navigate) and child (long-press-to-scrub):
- Parent resets to `'undecided'` on touchstart; sets `'swiping'` on flick detection; bails if already `'scrubbing'`
- Child (native `addEventListener`, `{ passive: false }`) sets `'scrubbing'` when long-press fires (only if still `'undecided'`); resets on touchend

Any long-press component needs `select-none` + `style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}`.

## Recurring layout patterns

Card list: `className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]"`

Icon cell (transactions, circle): `w-10 h-10 rounded-full bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0`

Icon cell (subscriptions, rounded square): `w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0`

## Bottom sheet rules

Canonical implementation: `money/AddTransactionSheet.tsx`.

- `height: calc(100dvh - env(safe-area-inset-top, 44px) - 8px)` (not `maxHeight`) with `flex flex-col`
- Scroll area: **inline** `style={{ flex: 1, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}`
- Outer wrapper: `style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(...)' }}`
- **Never** `document.body.style.overflow = 'hidden'` — breaks iOS touch scroll
- Background lock: `body.style.position = 'fixed'` + `body.style.top = -scrollY` + `documentElement.overscrollBehavior = 'none'` + direction-aware touchmove preventDefault
- Swipe-down dismiss: direct DOM mutation on `sheetRef` (no re-renders). Dismiss threshold: 80px drag. Clear inline styles inside setTimeout *before* `onClose()`.
- Keyboard-aware scroll: `visualViewport` resize listener pads scroll area by keyboard height, scrolls focused field above keyboard
- `usePullToRefresh` skips when `body.style.position === 'fixed'` — do not remove this guard
- Wrap `<input type="date/time">` in `overflow-hidden` div (iOS Safari doesn't clip native controls to border-radius)
- `style={{ colorScheme: 'dark' }}` on date/time inputs (not Tailwind class)
- `z-[60]` for sheets; `z-[70]` for RecurrencePicker above sheets

Every page root `<div>` includes `tab-enter`. Each route has a `loading.tsx` skeleton.

## Card styles & textures (`src/lib/cardStyles.ts`)

- `CARD_STYLE_DEFS` — 12 gradient styles, each with `gradient`, `chipFill`, `chipStroke`, `textPrimary`, `textMuted`
- `CARD_TEXTURE_DEFS` — 8 textures: none, diamonds, slate, fractal, grid, chevron, carbon, topography
- `STYLE_GROUPS` — 4 named groups for picker UI
- `getTexturePattern` is in `CardVisual.tsx` (JSX — can't live in `.ts`)
- `cards.texture text not null default 'none'` (migration `20260512_cards_style_texture_fix.sql`)
- `cards.sort_order int` — long-press drag-to-reorder (450ms, `haptic('tap')`, `flushSync`, native listeners `passive:false`). No Reorder button.

## RRULE expansion (`src/lib/rrule.ts`)

- `expandRRule(rule, baseDate, rangeStart, rangeEnd, exceptions?)` — RRULE without prefix → `YYYY-MM-DD[]`. Supports DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, UNTIL, COUNT.
- `rruleLabel(rule, baseDate)` — human-readable summary
- Calendar expands over fixed ±3 year window, fresh on every load
- **Postgres TIME columns** (`start_time`, `end_time`) come as `'HH:MM:SS'` from PostgREST — always `.slice(0, 5)` before use
- Cross-midnight events pushed to **both** start date and next day, both carrying `instanceDate = baseDate` (so editing from either opens the correct start)

## Theme system (`src/lib/theme.ts`)

Import from here, never re-define:
- `Theme`: `'obsidian' | 'charcoal-slate' | 'slate-mist' | 'midnight-teal'`
- `THEMES: ThemeDef[]`, `applyTheme(t)`, `readTheme()` (default `'obsidian'`)

`slate-mist` is the light theme. CSS vars per theme in `globals.css`. Pre-render inline script in `layout.tsx` applies theme before hydration. Viewport: `interactiveWidget: 'resizes-visual'` — nav never shifts on keyboard.

## Category metadata (`src/lib/category-meta.ts`)

- `ICON_REGISTRY` — 48 Lucide icons across 8 groups + `LayoutGrid` fallback (keys are component names: `'Utensils'`, `'Gamepad2'`, etc.)
- `COLOR_PALETTE` — 16 hex colors for picker
- `categoryMeta: Record<string, CategoryMeta>` — module-level cache. `setCategoryMeta(cats)` populates it. Not React context — direct import.
- `BUILTIN_EXPENSE_CATEGORIES` / `BUILTIN_INCOME_CATEGORIES` — used for initial DB seed

## Key utilities (`src/lib/utils.ts`)

- `$f(n)` — `$1,234` | `$fd(n)` — cents when non-zero | `$fc(n)` — always cents | `$fk(n)` — compact
- `calcSubCosts(cost, billing)` — `{ monthly, annual }`
- `nextRenewalDate(from, billing)` — advance by one billing cycle
- `daysUntil(date)` / `daysUntilLabel(date)`
- `localToday()` — `YYYY-MM-DD` in `America/Los_Angeles`. **Always use for dates written to DB.** Never `new Date().toISOString().slice(0,10)` (UTC, wrong for negative-offset zones). **Exception — calendar `isPast`**: use `new Date()` directly (not `localToday()`) to avoid timezone mismatch where LA-time "today" shows as past in browser.
- `fmtDate(d)` / `fmtMonth(d)`, `groupByMonth(rows)`, `clamp(v,min,max)`, `cn(...classes)`
- `haptic(style)` — `'tap'` (6ms) / `'confirm'` (10ms) / `'delete'` (double-pulse)

## `/in` page data storage

- `revenue_streams` table — `{ id, user_id, name, amount, freq, bank_id, next_pay_date }`. `handleStreamDone` upserts; delete uses deferred toast. `autoGenerateStreams` receives loaded streams, inserts income, advances `next_pay_date`.
- `banks` columns — `balance`, `apy`, `next_interest_date`, `interest_freq`. Bank balance does **not** auto-update when income lands — set manually.
- One-time localStorage → Supabase migration: `migrateFromLocalStorage()` (gated by `localStorage('hoardr-ls-migrated')`). To re-run: `localStorage.removeItem('hoardr-ls-migrated')` + hard-refresh.
- SQL: `20260528_revenue_streams_bank_balance.sql`. Requires separate `execute_sql` grant: `select, insert, update, delete on revenue_streams to authenticated`.

## App preferences (`src/lib/app-prefs.ts`)

`AppPrefs { defaultBankId, defaultBankName, defaultExpCat, defaultBilling }` in `localStorage('hoardr-app-prefs')`. `getAppPrefs()` / `setAppPrefs(patch)`.

## Week-start (`src/lib/week-start.ts`)

`getWeekStartsMonday()` / `setWeekStartsMonday(v)` — `localStorage('week-start-monday')`. Calendar reads this for grid column order.

## PWA

`src/app/manifest.ts` → `/manifest.webmanifest`. `appleWebApp.capable: true`, `statusBarStyle: 'black-translucent'`. Icons needed in `public/`: `apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png`.

## FAB pattern

Circular gold FAB: `fixed`, `right: 16, bottom: 80` (8px above 72px nav), `width: 56, height: 56`, `fontSize: 28`, `zIndex: 40`, `className="gradient-gold rounded-full"`. Box shadow: `'0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.25)'`. All tabs except Settings. Calendar has two FABs (Panel 0 pre-fills `gridSel`, Panel 1 pre-fills `selectedDay`). Never use a header button for add — FAB is the pattern.

## Calendar page architecture

Single client component (`calendar/page.tsx`), two panels on a horizontal rail: `transform: translateX(-${viewIndex * 100}vw)`, 320ms cubic-bezier. Both always mounted. `viewIndex: 0 | 1`.

**Panel 0 mobile** — Fantastical split: compact month grid (`GRID_EXPANDED = 280px` constant) + day list. Drag handle between them (tap = toggle, drag = live resize, release snaps to 0 or 280 at midpoint). Grid swipes → `goToNext()`/`goToPrev()`. Day tap sets `gridSel` + scrolls list manually (never `scrollIntoView` — fails in iOS WKWebView fixed containers; use `scrollTop` arithmetic). Gold vertical month label shows when `gridH === 0`. Event card tap opens `EditEventSheet`; blank-space tap → `openCreateSheet`. `e.stopPropagation()` on cards.

**Swipe navigation** — 60px threshold, `|dx| > |dy|×1.5`. Left swipe day row → Panel 1. Right drag Panel 1 → Panel 0 (preserves scroll).

**Edge-zone inter-tab** (Panel 0 only): inline `p0Start`/`p0End` handlers (not `TabSwipeNavigator`) gated behind `viewIndex === 0`. Studio ← Calendar → In.

**`months: MonthKey[]`** — drives infinite day list (mobile + PC list view). Initial 9 months. `topSentRef`/`botSentRef` IntersectionObservers skip on large-screen month mode.

**`notionWeeks: string[]`** — large-screen month grid only. 48 weeks centered on today's Sunday. `monthGridTopSentRef`/`monthGridBotSentRef` append/prepend 8 weeks at a time. `addWeeks()` uses local `new Date(y, m-1, d + n*7)` (never UTC).

**`gEvRangeKey`** — memoized union of months + notionWeeks date range; used as Google events fetch dependency.

**`suppressPrepend` ref** — prepend IntersectionObserver returns early when set; prevents double-rAF from clobbering initial scroll-to-today on iOS.

**Large screen (≥768px)** — List/Month toggle. `calView` persisted to localStorage.

**Notion grid sidebar** (215px, `background: '#1D2026'`): mini month navigator (syncs from grid scroll via `elementFromPoint`), per-type legend toggles (`hiddenTypes` local state), Today button, Add Calendar button. Per-type color customization via `prefs.typeColors` (DB-persisted). Each legend dot is a rounded square (`borderRadius: 3`); clicking opens a hidden `<input type="color">`. `colorInputRefs = useRef(new Map<string, HTMLInputElement>())`. `notionColor(ev)` resolves: Google → `ev.color ?? prefs.googleCalendarColors?.[calId] ?? DOT_COLOR['google']`; finance → `ev.color ?? prefs.typeColors?.[ev.type] ?? DOT_COLOR[ev.type]`.

**Notion main grid** constants (single source of truth): `MAX_VIS_EVENTS=6`, `EV_ROW_H=20`, `DATE_ROW_H=20`, `CELL_PAD_V=9`, `OVERFLOW_H=14`, `CELL_MIN_H=163`. Event pill types: all-day/income/sub → solid bg + white text 80%. Timed Google → transparent bg + 3px colored left bar. Span bars + single pills share `MAX_VIS_EVENTS` budget. Month-first cell renders gold month abbreviation upper-right.

**`lightTextColor(hex, isPast)`** — future: lightness 95%, sat capped 85% with **floor 35%** (prevents near-gray). Past: lightness 75%, sat capped 50%. Never apply CSS `opacity` to pill text — use `lightTextColor(bar, true)` for dimmed tone.

**Drag-and-drop** (large screen, Google events only): `dragState: { ev, originDate }|null`. **Critical**: `isBeingDragged = !!dragState && !!ev.id && dragState.ev.id === ev.id` — without `!!ev.id`, `undefined === undefined` fades all finance pills.

**Copy/paste** (Cmd/Ctrl+C/V): `copiedEvent`, `pasteDate` (hovered cell). Ghost dashed-gold pill while clipboard active.

**Event interaction** (large screen): hover tint `rgba(255,255,255,0.071)`. Selected: `rgba(255,255,255,0.145)` + `inset 0 0 0 2px rgba(255,255,255,0.6)`. Delete/Backspace → confirm dialog at `zIndex: 500`.

**`DayEventCard`** (inline in `calendar/page.tsx`) — event pills in day list and Panel 1. Trash on recurring → scope picker state, not immediate delete.

**Finance events** — `CalEvent` type: `type: 'income'|'sub'|'google'`. Custom events carry `recurrenceRule?` and `instanceDate?`.

**Recurring scopes** (`RecurrenceScope = 'this'|'following'|'all'`):
- `'this'` — add `instanceDate` to `recurrence_exceptions`
- `'following'` — set `UNTIL=<day before instanceDate>` on parent rule
- `'all'` — delete parent row
All use deferred-delete toast (5s undo).

**Weather** — Open-Meteo 14-day (free, no key). `weatherMap: Record<string, DayWeather>`. Lucide icons: `Sun`, `CloudSun`, `Cloud`, `CloudFog`, `CloudDrizzle`, `CloudRain`, `CloudSnow`, `CloudLightning`.

## Studio commission flow

`Pending → Approved → In Progress → Completed → Paid`

Approve → creates Google Calendar event (`cal_event_id`). Mark Paid → creates `income` row (`source: 'Freelance'`, `commission_id`); sets `income_id` + `paid_at`. Google Calendar proxied through `src/app/api/calendar/route.ts`.

`NewCalEvent` has `recurrenceRule: string` (empty = no recurrence). `AddEventSheet` auto-advances end time to start+30min on start change. `handleAddEvent` stores rule in `cal_events.recurrence_rule` and passes `recurrence: ['RRULE:' + rule]` to GCal API. Always use `timedEvent()` from `src/lib/calendar.ts` — it handles cross-midnight auto-advance. Never build GCal `dateTime` strings manually.

`CalendarSettingsSheet` (`CalPrefs`): `googleCalendarColors` + `typeColors` saved to `profiles.calendar_prefs`. Swatch picker at `zIndex: 80`, `COLOR_PALETTE` in 4-column grid.
