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

`src/middleware.ts` guards every route (unauthenticated → `/login`; logged-in on `/login` → `/home`; `/` → one or the other). It **must** live in `src/` — at the project root Next silently ignores it (it did, for months; the build output's `ƒ Middleware` line confirms it's registered).

## Keep-alive screens

Home, Out, In, Calendar, Profile and Settings live in `<route>/screen.tsx`; their `page.tsx` renders `null`. `components/nav/ScreenKeepAlive.tsx` (mounted in `(dashboard)/layout.tsx`) renders the screens itself and **keeps each one mounted** after its first render — the active one in normal flow, the rest in a fixed, `visibility:hidden`, `inert` layer (`.screen-hidden`) so they stay laid out but don't paint, take input or add page height. After the first screen paints, the others mount one per idle slot, so the whole app is warm shortly after sign-in (behind the greeting). Each screen's window scroll position is saved and restored.

- **Tab switches must stay cheap** — they run inside the view transition's capture, so any render work there is a visible pause between tap and slide. Screens render through a memoized `ScreenBody`, so a switch re-renders only what reads the changed context (it used to re-render all six screens, calendar rows included). The screen being left is hidden immediately by its wrapper's class but keeps `ScreenActiveContext` true until after the slide (`leaving`, flipped in idle time inside `startTransition`), so its own re-render happens off the critical path. `BottomNav` navigates on `pointerdown`, not `click` (the click only `preventDefault`s the link). **Never stack view transitions**: a tap while a slide is running calls `skipTransition()` on it and switches without a new one (`currentVT` in `tab-nav.ts`), and a superseded slide's update callback is a no-op (`navSeq`). Starting a full-screen snapshot per tap is what crashed iOS Safari when tabs were tapped rapidly. **The slide's "done" must always settle**: number rolls, bar growth, `useOnScreenReturn` and the leaving screen's deactivation all wait on it, and iOS Safari doesn't reliably settle `vt.finished` for an interrupted slide — that froze every number at 0. It races `finished` against `SLIDE_MS + 400`, and the two-frame wait after it falls back to a 150ms timer. Never await `vt.finished` bare.
- Navigation is optimistic: `BottomNav` / `ProfileDrawer` / Profile's settings button call `setPendingPath(href)` so the screen and the nav highlight switch on tap; `useActivePath()` (`src/lib/tab-nav.ts`) is the path to render against, not `usePathname()`.
- A kept-alive screen doesn't refetch by remounting. Every screen calls `useOnScreenReturn(reload)` to refresh in the background when it's shown again — new screens must too. It only runs when the data may be stale: `src/lib/data-version.ts` is bumped by every `showToast` (all adds / payments / deletes toast; bumped again 2.5s later because writes land after the toast) and by toast undo/commit, and a refresh also runs once the screen's last load is over 5 minutes old, or after the app comes back from more than a minute in the background. Any write that doesn't toast must call `markDataChangedSoon()` itself, or other screens won't pick it up until the 5 minutes pass.
- Hidden screens are still mounted, so **document/window listeners must be gated**: `useScreenActive()` is false while hidden. `usePullToRefresh` and `usePillSwipe` already check it; the calendar also clears selection / copied event / popovers when it deactivates (its ⌘V/Backspace shortcuts are document-level).
- Entrance animations must key off `useScreenVisit()` (0 until first shown, +1 on every show), not mount: screens mount hidden, so a mount-time animation plays unseen and never replays. `SlotNumber`, `PaceChart`'s reveal, Out's `CategoryPillBar` and In's `IncomeBarChart` do this. `SlotNumber` spins **once per visit, timed per number**: its digits share a start time kept in a ref (reset when the visit changes), so a value that settles in stages as a reload's lists arrive lands mid-spin instead of restarting it, a drum remounted by a digit-count change joins with a negative transition delay, a number first shown later in the visit gets its own spin, and a change after the spin is a short roll from the old digit. Each digit is a **20-cell strip (0-9 twice) that rolls once to its digit with a CSS transform transition** — compositor-driven, so it stays smooth while the main thread is busy. Don't go back to either earlier version: a ~60-digit strip rolled through blank stretches on iPhone (iOS only rasterizes part of a layer that tall), and a rAF drum rewriting text every frame stuttered during the tab slide.
- The screen wrapper animates opacity only — a transform would re-anchor the screen's `position: fixed` FAB and sheets.
- **Smoothness rules for anything that runs on a screen visit** (each was a real stutter, mostly only on iPhone during the tab slide):
  - Background refreshes (`useOnScreenReturn`) **never show skeletons/"Loading…"** once there is data, and **skip `setState` when nothing changed** — `sameAsLast(ref, value)` (`src/lib/same-data.ts`). Home, Out, In, Profile, Calendar and Settings all do. Calendar must not hand `setPrefs` a fresh-but-equal object: a new `googleCalendarIds` array re-runs the Google fetch.
  - Paged feeds keep their loaded pages when the refreshed first page matches what's shown (resetting changed the page height under the user).
  - Visit-keyed resets happen in a **layout effect** (an effect paints the old state for a frame, then snaps), and the visit counter itself is bumped during render in `ScreenKeepAlive`.
  - Bars grow with `transform: scaleX/scaleY` + `transformOrigin`, never `width`/`height` (layout every frame). Out's `CategoryPillBar`, In's `IncomeBarChart` and Profile's `CashflowCard` columns / `RankPills` (`useGrowIn`) follow this; data changes ease to the new scale instead of collapsing to zero.
  - No tall layers under a transform (see `SlotNumber`), no full-screen `backdrop-filter`.
  - **Desktop slides use a plain fade** (`@media (pointer: fine)` in globals.css): no `plus-lighter` blend / isolated image pair (an extra full-window compositing pass per frame) and no scale on the outgoing snapshot. Phones keep the original slide untouched.
  - **Nothing loops during a slide.** The incoming screen is a live capture, so a running animation in it (the hero's today pulse, `LoadBars`, skeleton pulses, spinners) re-renders the whole capture every frame — invisible on a phone, micro-stutters at desktop size. `html[data-tab-dir]` pauses `.greet-pulse`, `.load-bars > span`, `.animate-pulse` and `.animate-spin`; a new infinite animation needs adding to that rule. `revive()` (the touch-scroll fix) runs on touch WebKit only — on desktop it was a forced re-layout as the slide landed.
  - Scroll areas nested inside a `position: fixed` screen (the calendar's lists) carry `data-touch-scroll`: after each tab slide `navigateTab` toggles their overflow so WebKit rebuilds the scrolling layer — on iPhone a view transition could leave them dead to touch. New nested scrollers on screens need the attribute too.
  - **Entrance animations start after the tab slide** — `onSlideDone(cb)` / `afterSlideTimeout(cb, ms)` (`src/lib/tab-nav.ts`) fire two frames after the view transition's `finished`, not at an estimate: the frame where iOS hands back from the snapshots to the live page is itself a hitch. (`afterSlide(ms)` is the estimate, only for CSS animation delays.) `useOnScreenReturn` callbacks also run ~900ms after the slide, so a refresh's results never land mid-roll. iOS Safari re-captures the incoming screen every frame of a view transition, so anything animating inside it (number rolls, bar growth, the sparkline reveal) was choppy on iPhone only; first load and the post-greeting replay have no slide and no delay.
- These routes have no `loading.tsx`; `settings/categories` and `settings/defaults` are ordinary routes rendered through `{children}`.

## Navigation — four tabs

`BottomNav` has four tabs. **Switching screens never goes through the Next router**: `navigateTab(path, mode)` (`src/lib/tab-nav.ts`) flips the kept-alive screen and updates the URL with `history.replaceState` (tabs — no history, so the iOS back-swipe can't walk between them) or `pushState` (Profile, Settings), which Next 15 tracks natively. A router navigation fetched the route from the server on every tap, and after a deploy that fetch saw a new build and hard-reloaded the whole app. Use `navigateTab` for any link to a kept-alive screen; sub-routes like `/settings/categories` still use the router.

| Route | Label | Feature |
|---|---|---|
| `/home` | Hoard | Spend-pace hero (vs last month) + stats, upcoming bills, recent activity |
| `/money` | Out | 30-day bar chart + expense/income feed with filter |
| `/in` | In | Income list + Cards + Banks (three-tab PillGroup) |
| `/calendar` | Calendar | Compact month grid (phone) / Notion-style infinite grid (iPad+) |

`/wallet` and `/plans` redirect to `/in`; `/studio` (removed commission desk) redirects to `/home`. The `commissions` table and `income.commission_id` remain in the DB but nothing in the app reads them. `/settings` still exists (categories + defaults sub-pages) but is **not** in the nav — reached via the profile button.

**Profile button** (`src/components/profile/ProfileDrawer.tsx`) — fixed avatar button top-right on every page; hidden on `/profile` and `/settings`. Tapping navigates to `/profile`. Hidden by checking `usePathname()`.

**`/profile` page** — the history page. On desktop it's one centered `max-w-[632px]` column so its cards line up with Settings' (`max-w-[640px]` less 24px gutters = 592px of content either way); full width on a phone. Header: your photo full-bleed (safe area + 232px, fading into the page) with glass back/settings buttons, "Since {first month}", the name large over it and the email; tap the photo to upload a new one (Supabase Storage `avatars` bucket), tap the name to edit it (`profiles.display_name`). Then historical stats only — **"this month" lives on Home's hero and is never repeated here**, and every number appears once on the page. All of it is derived in one pass by `profileStats()` (`src/lib/profile-stats.ts`). Sections: `CashflowCard` (`components/profile/CashflowCard.tsx`: one net column per month, green above the zero line / red below, ranges: a `12 mo` pill plus a `‹ year ›` stepper — fixed size however many years of data exist (a pill per year grew forever); tap or drag to pick a month and read its In / Out / Subs / Net, top 4 categories, expense count, share of income kept and discount savings underneath; the range total sits on top), Records (best / toughest month by net, biggest payday month, biggest purchase, green streak of finished months, average month), then three **ranged** breakdowns — Categories, Subscriptions (paid in the range per active sub, with its $/mo; footer totals and $/mo · $/yr), Income sources — each with its own `This mo · 6 mo · This yr · All` pills (`breakdown()` / `BREAK_RANGES` in `profile-stats.ts`). Trends compare a range to the same point of the period before (this month so far vs last month to the same day; All = last 90 days vs the 90 before). All time (earned, spent, kept, discounts, expenses logged, months tracked — "since" lives in the header). Settings gear navigates to `/settings`.

**`/in` page** — three PillGroup tabs (`History | Streams | Accounts`). History: income rows filtered `date <= today`. Streams: `revenue_streams` table + bank interest streams; `autoGenerateStreams(userId, streams)` runs once per session (`let sessionAutoGenDone = false` guard). Accounts: Banks (balance large on the right; type · last 4 · linked cards; APY and the next payout in green), Cards (long-press drag-to-reorder, "Hold to reorder" in the header), Transfers (latest 5, Show all up to 50) — gold `SectionHead` labels, an empty state with an icon. FAB has three actions: New Transfer, Add Account, New Income.

**`/settings`** — Appearance (theme, icon mode, week start), Calendar filters, Defaults (default card/bank/category/billing), **Connections**, Your data (backup / CSV), Devices & sessions, Sign out.

**Connections** (`components/settings/ConnectionsGroup.tsx`, registry in `src/lib/connections.ts`) — every outside service with a live status (green ok · gold needs action · red error · grey not set up), checked when Settings opens and on each return. A row that needs attention shows its fix as a gold button (Reconnect, Sign in, Allow); tapping a row expands what it's used for, Check again, and its action. Services today: Hoardr account (Supabase session + a profile read), Google Calendar (`/api/calendar?action=calendars`: 403 → reconnect via `connectGoogleCalendar`, never a sign-out), Google Places (key present), Weather (geolocation permission). **A new integration = one entry in `CONNECTIONS`** with `check()` returning `{ state, detail, action? }`. Categories and Defaults are sub-pages.

## Data model

Tables (schema in `supabase/migrations/`): `categories`, `banks`, `cards`, `expenses`, `wishlist`, `subscriptions`, `income`, `commissions`, `revenue_streams`, `cal_events`, `transfers`. `profiles` stores per-user data. `ledger` view unions expenses + income + subscription payments.

Key invariants:
- `expenses.savings` is a **generated column**: `coalesce(original_cost, cost) - cost`
- `expenses` has **no direct `category` column** — category is a FK to `categories`. Query via `categories(name)` join; PostgREST returns it as a `{ name: string }` **object** (not array) for many-to-one FK. Cast: `(e.categories as { name: string } | null)?.name`.
- `subscriptions.monthly_cost` / `annual_cost` are **stored** — recompute with `calcSubCosts()` on every subscription save
- Income is a **first-class table**, not mixed into ledger
- `commissions.cal_event_id` set on Approve; cleared and recreated on deadline changes
- `subscriptions.bank_id uuid` — set when subscription charges a bank directly (Direct toggle); mutually exclusive with `card_id` (one must be null)
- `transfers` — `{ id, user_id, from_bank_id, to_bank_id, amount, date, note }`. Adding a transfer updates both bank balances immediately; deleting reverses them via deferred-delete undo.
- `wishlist_status` enum: `'Interested' → 'Ordered' → 'Delivered'`. `wishlist.ordered_at text` = purchase/paid date (set on buy); `wishlist.delivered_at text` = arrival date (set on "mark arrived"). Marking an Ordered item arrived (home En Route swipe) transitions it to `'Delivered'` with `delivered_at = localToday()` — it is **not** deleted. OUT → Wishlist shows a **Delivered** section (category · paid date · delivery date); tapping opens `EditWishlistSheet`, which surfaces an editable Delivery Date field only when `status === 'Delivered'`. The app uses the **`category` (text)** and **`url`** columns — **not** the legacy `category_id`/`link`/`expense_id` columns, which still exist on the table but are unused; never write them. The `wishlist_status` enum also still carries a legacy `'Purchased'` value the app never writes. Canonical row shape is `WishlistItem` in `src/types/index.ts`.
- `cal_events` recurrence columns: `recurrence_rule text` (RRULE without prefix), `recurrence_exceptions text[] default '{}'`, `recurrence_parent_id uuid` (reserved)
- `profiles` has: `google_refresh_token`, `calendar_prefs` (jsonb), `avatar_url text`, `display_name text`
- Supabase Storage bucket `avatars` (public) — user files stored at `{userId}/avatar.jpg`. Uploads keep the whole photo (no square crop) at up to 2000px on the long side, JPEG 0.9: it's the Profile banner and the greeting hero, ~630px wide on desktop at 2x — the old 400px square pixelated there. Google photos are requested large through `hiResGoogle(url, px)` (`src/lib/image.ts`): 1600 on Profile, 1200 on the greeting. The load screen uses `/icons/icon-512.png`, not the 211px `DARKICON.png`.

## RLS coverage

All 12 tables have RLS **enabled** with exactly one `owner_all` policy each, scoped `TO authenticated`: USING + WITH CHECK `auth.uid() = user_id` (`profiles` keys off `id`). Established by `20260720_enable_rls_all_tables.sql`, which also collapsed 29 overlapping policies down to 12.

**Never disable RLS to fix a write failure.** Nine tables sat with `relrowsecurity = false` for months because writes were failing and RLS looked like the culprit. It wasn't — the sessions were dying (middleware wasn't carrying rotated auth cookies onto redirects, so `auth.uid()` silently became null; see the middleware invariant above). Meanwhile the anon key ships in the client bundle, so every expense, income row, bank, card and profile was publicly readable *and writable*. If writes start failing, check the session first — `db-error.ts` now surfaces these instead of swallowing them.

**Tables are not the whole story — check views and functions too:**
- **`ledger` is a view, and views ignore RLS unless `security_invoker` is set.** It's owned by `postgres`, so it read straight through every table policy: `/rest/v1/ledger` still returned all expenses/income/subscriptions anonymously *after* the tables were locked down. Fixed in `20260720_secure_ledger_view.sql` with `ALTER VIEW … SET (security_invoker = on)`. Any future view over these tables needs the same.
- `handle_new_user()` (SECURITY DEFINER signup trigger) had no ACL, so EXECUTE defaulted to PUBLIC and it was callable at `/rest/v1/rpc/handle_new_user`. Now granted only to `postgres`, `supabase_auth_admin`, `service_role` — the grant to `supabase_auth_admin` is what keeps signup working.

**Hardening (`20261101_security_hardening.sql`)**: `anon` holds no privileges at all in `public` (tables, sequences, functions, and default privileges for future ones); `authenticated` has only select/insert/update/delete (no TRUNCATE — it bypasses RLS — REFERENCES or TRIGGER). The public `avatars` bucket serves files through public URLs, so it has **no public SELECT policy** (that let anyone list every user id); owners can read their own folder (upsert needs it), and uploads are capped at 5 MB of jpeg/png/webp/heic. `next.config.ts` sends HSTS, nosniff, `X-Frame-Options: DENY`, a strict referrer policy, a Permissions-Policy (geolocation self only) and a CSP limited to `frame-ancestors/object-src/base-uri` (scripts aren't restricted: the inline boot scripts and Google Maps need them). `/auth/callback` redirects to `request.nextUrl.origin`, never an origin built from Host / X-Forwarded headers (open redirect with fresh auth cookies). `npm audit --omit=dev` is clean; Next's bundled PostCSS is pinned through `overrides` in package.json.

**Backups** — Settings → Your data: `downloadBackup()` (`src/lib/backup.ts`) saves every table (paged past PostgREST's 1000-row cap) plus the profile **minus `google_refresh_token`** as one JSON file; `downloadTransactionsCsv()` saves all expenses + income as one spreadsheet (formula-leading cells are prefixed so a spreadsheet won't execute them). On iPhone it goes through the share sheet (Save to Files) — a home-screen app can't download reliably.

To verify, hit the REST API with the anon key and no session: every table must return `0` rows or 401, and so must `ledger`. `mcp__supabase__get_advisors(type: 'security')` catches view/function gaps that a table-only audit misses.

## Supabase clients

Two clients — never swap:
- `src/lib/supabase/client.ts` — browser (`'use client'` components)
- `src/lib/supabase/server.ts` — server components and API routes (cookie-aware, async)

## Auth & session lifecycle

Google OAuth via Supabase. Login (`(auth)/login`) calls `signInWithOAuth` with `access_type: 'offline'`. The callback route (`src/app/auth/callback/route.ts`) exchanges the code, persists `provider_refresh_token` into `profiles.google_refresh_token` (for Calendar CRUD), and copies the new auth cookies onto its redirect response.

**Re-granting Calendar access without signing out** — `profiles.google_refresh_token` is per-user and used server-side by `/api/calendar` for every device, so once a valid token is stored Calendar works on all devices. To re-grant a stale/missing token, call `connectGoogleCalendar(email)` (`src/lib/gcal-connect.ts`), wired to **Settings → Connections → Google Calendar → Reconnect**. It re-runs `signInWithOAuth` with `prompt: 'consent'` + `login_hint` as the same account — the Supabase session is just re-issued (never signed out), and `/auth/callback` stores the fresh token. Do **not** tell users to sign out for this. The `/api/calendar` route returns a 403 with reconnect copy both when the token is missing and when `refreshAccessToken` fails (`token_refresh_failed`, i.e. the stored token was revoked/expired).

**Refresh-token rotation — the browser is the only refresher.** Supabase rotates the refresh token on every refresh; if a rotation happens server-side and the response carrying the new cookie is lost (iOS suspending the PWA mid-request, the router aborting a fetch), the browser keeps the revoked token, its next use is flagged as reuse, and the whole session is killed (`Refresh Token Not Found` in auth logs). Rules:
- `src/middleware.ts` calls `getUser()` (may refresh) **only on full document loads** (`Sec-Fetch-Dest: document`). RSC navigations/prefetches just check the `sb-*-auth-token` cookie exists — Next strips its own `RSC` header before middleware, so don't key off that. A network error from `getUser()` with a cookie present is not treated as signed out.
- Every redirect the middleware returns copies `supabaseResponse` cookies across (rotated tokens must reach the browser).
- On document loads the middleware re-issues the auth cookies server-side with a 400-day maxAge — Safari ITP caps JS-written cookies (the browser client's) at 7 days.
- `/api/calendar` authenticates from an `Authorization: Bearer <access_token>` header (`calFetch` in `src/lib/calendar.ts`), never the cookie session, and never refreshes. All client calls to it must go through `calFetch`.
- `AuthWatcher` only checks `getSession()` (which refreshes in-browser if needed) — no extra `refreshSession()` racing it — and never signs out over a retryable network error.

**`AuthWatcher`** (`src/components/auth/AuthWatcher.tsx`, mounted in `(dashboard)/layout.tsx`) — global session guard. On `onAuthStateChange` `SIGNED_OUT` it toasts and routes to `/login`. On focus/visibility it revalidates via `getSession()`, silently refreshing an expired-but-recoverable session (no forced re-login); only a genuinely dead session routes to login. Prefer `getSession()` over `getUser()` for this — `getUser()` 401s on a merely-expired access token even when the refresh token is still valid.

**Write safety (`src/lib/db-error.ts`)** — user-initiated RLS writes must surface failure, never `console.error`-and-continue:
- `requireUser(supabase, action)` — resolves the user via `getSession()`; toasts "Session expired" and returns `null` when the session is truly gone.
- `reportDbError(error, action)` — toasts on a rejected write (session-expired copy for auth-like codes `PGRST301` / `42501` / JWT messages); returns `true` so the caller can bail.

## Greeting (daily brief)

`components/home/GreetingOverlay.tsx` shows once per browser session and never twice within 30 minutes. That is decided **before the first paint** by an inline `<head>` script (`GREETING_BOOT_SCRIPT`, `src/lib/greeting-boot.ts`), which adds `html.greet-boot` — a solid cover in `globals.css` — so the server-rendered page never shows or animates under it; the overlay removes the class once its own opaque backdrop is up, and on dismiss calls `replayActiveScreen()` so the screen's entrance animations play visibly. Settings → Preview daily brief calls `showGreeting()`. **When the brief isn't due, the same head script covers the page for the load screen** (`html.boot-splash`, `components/nav/BootSplash.tsx`: the app icon (`/DARKICON.png`, the dragon) + late `LoadBars`). The splash is **in the server HTML** and shown by CSS (`.boot-splash-el`, visible while `html.boot-splash` is on or `data-show` is set), so the logo is there from the first frame — a plain `body::after` cover until React mounted showed a blank screen on slow loads — the server-rendered skeletons never matched the real layout. It lifts once the visible screen reports its data via `useScreenReady(ready)` (every keep-alive screen calls it; a new screen must too) or after 3s, fading out while `replayActiveScreen()` plays the entrance and doubles as the warm-up screen while `ScreenKeepAlive` mounts the other tabs. It shows the weather on the date line (`loadNowWeather()` in `src/lib/weather.ts`: now + today's high/low from Open-Meteo, cached 20 min, only with a location the calendar already saved or the user already allowed — the brief never prompts — capped at 2s), today's Google events (via `calFetch`), Hoard's hero card (`HomeHero`, the same component and data — `buildHeroSeries` in `src/lib/hero-series.ts` — as Home), income, no-spend days, en-route orders, today's Google events and bills and paydays in the next 7 days (subscriptions + `revenue_streams`, advanced past stale dates). Theme colors only. Entrance: a near-solid theme scrim is up from the first paint (layout effect, no backdrop blur — blurring the page while the tabs mount behind it stuttered); everything — money queries, today's Google events (chained off the profile's calendar ids, in parallel with the rest) and the banner photo (`preloadImage`, decoded) — loads before a single reveal (3s cap; a spinner after 450ms), so nothing pops in afterwards. The card is sized to the screen (`100dvh` less safe areas and the hint line, max 900px) and the hero photo is `flex: 1` — it takes whatever height the stats leave (min 150px) so the card never scrolls on phone or desktop; keep the stats compact (2 events, 2 upcoming; photo min 96px). The hero ( clear on top and fading into the card where the greeting sits; `hiRes()` asks Google for a 720px avatar) scrolls with the card only as a last resort, card max 380px on every screen. Layout, sections split by hairlines: the photo, then **Hoard's hero** at full card width (so on a phone it's exactly as wide as Home's), shown at `HERO_SCALE` (0.84, a transform — never a different layout) to leave more photo, then Income / No-spend days (full days before today) / On the way, then Today and Next 7 days (out/in totals). Sections rise in with `.greet-rise` (staggered `--d`). Numbers roll with `SlotNumber`'s `startAt` (an exact `performance.now()` start, staggered off the card's entrance — outside a screen there's no visit to key off); `HomeHero` takes `greeting={{ rollAt, chartDelay }}` for this. **On dismiss the hero flies onto Home** (`flyHeroHome`): a frozen DOM clone of the card's hero (every `animation` set to none) is placed at its real size scaled to where it shows, then moved to Home's `[data-home-hero]` rect with one transform transition — growing to full size as it lands. That uniform scale only fits when both cards have the same shape (phone). On desktop Home's card is far wider than the greeting's but the same height, so a uniform scale doubled the copy's height and it vanished onto the shorter card; there (`sameShape` false) it transitions `width`/`height` to Home's box instead, with transform only for the move. `lib/hero-handoff.ts` keeps Home's hero hidden while it's in the air and makes it skip that visit's entrance (`PaceChart still`, `SlotNumber startAt` far in the past), so the clone lands on an identical, already-drawn card and is removed two frames later. Skipped when Home isn't the visible screen, its hero is off screen, or reduced motion is on. Animations are the `greet-*` keyframes in `globals.css`.

## Async safety pattern (required on every `'use client'` page)

Rapid tab switching causes in-flight queries to resolve after unmount → Safari WKWebView crashes. Every client page must guard with a generation counter + AbortController. Canonical example: `home/page.tsx`. Pattern: `loadGen = useRef(0)`, `abortRef = useRef<AbortController|null>(null)`, increment gen and abort on each call, discard result if `gen !== loadGen.current`. Cleanup: `return () => { loadGen.current++; abortRef.current?.abort() }`. Second data fetch needs a separate `detailGen` + `detailAbortRef`.

## Paginated feeds (`/money` Expenses, `/in` History)

Both feeds page with `.range(offset, offset + LIMIT - 1)` (LIMIT = 100) behind an
IntersectionObserver sentinel, tracked by an `offsetRef`.

- **Order by `date, created_at, id` — the `id` tiebreaker is required.** `(date, created_at)` is not unique; tied rows shuffle between queries, so offset pages silently overlap and skip entries. Without it a full walk of 1310 expenses yielded only 1308 distinct rows.
- `hasMore` must key off the **raw** page length, never the deduped one. A full page that happens to be entirely already-seen still means more rows exist behind it.
- The sentinel effect's deps must include `hasMore`, the active tab, and the search term — the sentinel is conditionally rendered, and re-observing fires an immediate intersection callback so a short list doesn't stall.
- `/in` stat tiles + `IncomeBarChart` read `recentIncome` (its own date-bounded query), **not** the paginated `incomeList` — otherwise the totals would drift with scroll depth.
- **Background refreshes never show skeletons.** `/in`'s `loadIncome` sets `incomeLoading` only on the very first load (no rows yet); a return-to-tab refresh keeps the rows on screen, and both `loadData` and `loadIncome` skip `setState` when a content signature says nothing changed. Swapping skeletons in on every return unmounted the stat tiles' `SlotNumber`s (restarting the roll) and popped History in a beat later, mid tab-transition. The income list + stats window are cached in `pageCache('in-income')`.

**Search is server-side and spans all history**, not just the loaded pages. Debounced 250ms into a query, with a generation counter to drop stale responses; falls back to filtering loaded rows while in flight. Edit/delete handlers must look the row up in the *displayed* list (`filteredSorted` / `displayIncome`) and patch `searchRows` too — a search hit may never have been in the paged feed.

PostgREST gotchas these queries hit:
- `or=(...)` is comma/paren delimited and `ilike` treats `%`/`_` as wildcards — `sanitizeSearch()` strips the structural characters.
- Category matches need a **second query** (`categories!inner(name)` + `.ilike('categories.name', …)`) merged by id; PostgREST can't OR across a base column and an embedded one.
- **`income.source` is a Postgres enum**, so `ilike` errors with `operator does not exist: income_source ~~*`, and a `::text` cast inside an `or=` logic tree is a parse error. Resolve the term to matching enum labels client-side and match with `source.in.("A","B")` instead.

## pageCache (`src/lib/page-cache.ts`)

Module-level in-memory cache, TTL = 30 min. Used by all tabs (and the calendar) for first paint only — every page still refetches on mount — so revisiting a tab shows its last data instead of a skeleton.
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

- `nav/BottomNav.tsx` — floating frosted-glass capsule (62px, 10px above the safe area, max 420px wide). Tab order: Hoard/Out/In/Calendar. Plain `<a>`s whose click calls `navigateTab` (modified clicks keep browser behavior). Active = a glass pill behind the tab, slid with `transform`. `(dashboard)/layout.tsx`'s `<main>` pads `safe-area + 84px` to clear it.
- **Frosted glass** — `.frost` / `.frost-strong` (globals.css) and the `--glass-*` tokens (dark tint in dark themes, white glass in Slate Mist) for floating chrome over content: bottom nav, toasts, FAB menu, `Select` menus, the calendar popover + its dropdowns and context menus. Never blur a full-screen backdrop or a panel while it scales — that's what made the FAB stutter.
- `.spark-area` — sparkline areas blend with `screen` on dark themes and `multiply` on light ones (`screen` on white is invisible).
- `nav/TabSwipeNavigator.tsx` — **not mounted anywhere**; file exists but is unused. Inter-tab swipe was removed in favour of `replace` navigation.
- `hooks/usePillSwipe.ts` — used by `/money` and `/in`. Handles **intra-tab pill switching only** — cross-route navigation was removed. Args: `(tab, setTab, options)`.
- `ui/CategoryIcon.tsx` — glyph from `categoryMeta[name]` (DB icon) or defaults; color is **always semantic** (gold expense, emerald income, `sem-sub` subscription). Per-category DB colors are not used for icons — they loaded late and made tabs inconsistent. `CategoryPicker` and `FormRow` icons follow the same neutral style (no colored tiles).
- `ui/LoadBars.tsx` — the app's loading indicator: six gold bars that flatten and rise to uneven heights like a small bar chart, in a wave (`.load-bars` in globals.css, `scaleY` from the bottom only). Use it instead of a spinner or dots.
- `ui/SwipeToDelete.tsx` — swipe-left-to-delete; `onTap` fires on clean tap only; `actionBg` default `bg-ruby`. `onRight`/`rightLabel`/`rightBg` for right-swipe confirm. Press-scale + haptic built in.
- `ui/Sheet.tsx` + `ui/Form.tsx` — the iOS sheet and form kit (see Bottom sheet rules). `money/AddTransactionSheet.tsx` is the reference sheet built on them; exports `CardOption`, `BankOption`. Field order is required-first: amount → merchant → category → card/bank + date → **More** (note, discount). **Merchant memory** (`src/lib/tx-memory.ts`): one module-level load of the last 18 months of expenses + income (warmed on sheet mount, refreshed when stale on open, `rememberTx` patches it after an add). Typing a merchant lists matching names you've used (prefix first, then by use count); tapping one fills its latest category, card/bank and — if empty — amount. Typing a known name in full applies category/card on blur. A category or card you picked yourself in this sheet is never overridden. Categories are ordered by use in the last 180 days (`byUse`). Suggestion rows act on `pointerdown` (preventDefault) so the input's blur doesn't unmount them before the tap lands.
- `wallet/RevenueStreamSheet.tsx` — `RevenueStreamConfig: { id, name, amount, freq, bankId, nextPayDate }`. **No DB ops** — calls `onDone(config)` synchronously.
- `wallet/AddTransferSheet.tsx` — `TransferPayload: { from_bank_id, to_bank_id, amount, date, note }`. Swap button swaps from/to. Calls `onAdd(payload)` then closes; caller handles DB + balance updates.
- `wallet/CardVisual.tsx` — renders card from `Card` prop using `CARD_STYLE_DEFS`. `getTexturePattern` inline (JSX). Accepts `expenseCount?`, `subCount?`.
- `ui/SemanticColorSheet.tsx` — accent color customization (Income/Expense/Subs). `react-colorful`. Dispatches `sem-colors-changed` on save.
- `calendar/RecurrencePicker.tsx` — `z-[70]`. Preset list + custom builder.
- `calendar/EditEventSheet.tsx` — iPhone sheet for create/edit. `EditableEvent.id` optional (no id = create mode). Cross-midnight: auto-bumps `endDate` +1 when `endTime < startTime`.
- `calendar/CalendarPopover.tsx` — Notion-style popover for large screens; falls back to centered modal on iPhone. Google Places: use `defaultValue` (not `value`) — Places mutates DOM directly.
- `calendar/DateRangePicker.tsx` — app-themed calendar picker popover (`z-[210]`), `mode: 'range' | 'single'`. Shown on large screens only (`useIsLargeScreen`, `src/lib/use-large-screen.ts`, ≥768px) in place of native `<input type="date">`; iPhone keeps native. Range = From→To (event `date`/`endDate`); single = one date. Wired into `CalendarPopover` + `EditEventSheet` (range).
- `ui/CustomDateInput.tsx` — drop-in for one native date input: renders native `<input type="date">` on phone, a `DateRangePicker` (single) trigger on large screens. Pass the same `className`/`style` as the native input. Used by the transaction / subscription / transfer / deposit / paycheck / commission / revenue-stream sheets, the `RecurrencePicker` "ends on" field, `/in` interest date and `/money` wishlist buy date.

**No native date pickers on large screens.** Every `<input type="date">` left in the tree must sit behind an `isModal` / `!isLargeScreen` branch (iPhone keeps its wheel picker). `DateRangePicker` portals itself to `document.body` — bottom sheets set `transform`/`will-change` on their container, which would otherwise make its `position: fixed` resolve against the sheet and get clipped. `CalendarPopover` is the one exception that still mounts the picker as a top-level sibling rather than inline.
- `profile/ProfileDrawer.tsx` — fixed avatar button top-right on every dashboard page. Hidden on `/profile` and `/settings`. Reads `profiles.avatar_url` and `profiles.display_name`; falls back to Google OAuth avatar and name from `user_metadata`.
- `home/HomeHero.tsx` — Hoard's hero card (292px): spent this month (or this year — swipe / dots), a pace legend (gold total · dashed last month at the same point · ↓/↑ %), and a stats strip (Spent · Subs · Net · Avg / day — Spent excludes subs so the two add up to the hero number; year: Avg / mo). Scrubbing swaps the legend to that day's running total, last month's, and the difference. `gestureMode` ref coordinates flick-to-switch vs long-press-to-scrub with child `PaceChart`. Data is `HeroSeries` built in `home/screen.tsx` from one expenses + income query reaching back to the start of last month (so January still has a comparison).
- `home/PaceChart.tsx` — running spend as a soft gold area (horizontal-tangent Béziers, peak-anchored gradient) with last month's running spend as a dashed line + faint fill behind it, and a today dot (`.greet-pop` + `.greet-pulse`) after the clip reveal. Gradients use `gradientUnits="userSpaceOnUse"`. Colors read via `getComputedStyle` (not inline `var()` — WebKit SVG). Touch via native `addEventListener` `{ passive: false }`; 300ms long-press → scrub.

## Inline hero components (defined in-file, not extracted)

- `DailyBarChart` (money page) — 30-day net bars, RAF height transition
- `CategoryPillBar` (money page) — 32px animated pill bar. Track `#1C1F22`, gold gradient fill. `variant='emerald'` switches to emerald gradient. `onClick` + `isExpanded` adds a rotating `›` chevron and toggles a max-height drilldown list below.
- `IncomeBarChart` (in page) — last 6 months as **horizontal pill bars**, newest first, matching Out's `CategoryPillBar` (32px track, income-accent gradient fill grown with `scaleX`). Listens to `sem-colors-changed`.
- `StatCard` (in page) — `SlotNumber` stat tile.
- `/profile` sections (in-file): `Card`, `Record` tiles, `RankPills` (categories / subs / income sources), `RangePills`.

### OUT tab stat card → graph interaction

Subs section: "This Month" / "This Year" stat cards (rendered as `<button>`) drive `subStatCard` state. The category bar graph switches between `paidMonthCatBreakdown` and `paidYearCatBreakdown`. Clicking a bar expands a drilldown list (`expandedSubCat` state) with individual payment rows; max-height = `items.length * 60 + 4` px.

Expenses section: "Spent This Month" / "Saved This Month" stat cards drive `expStatCard` state. Spent uses gold `CategoryPillBar`; Saved uses `variant='emerald'` and `border-emerald/40` card highlight.

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

**Theme-safe color rules** (Slate Mist is light; it showed black panels and invisible borders until these were applied app-wide):
- Subtle lines/fills: `border-ink/[0.06]`, `bg-ink/[0.04]`, `rgb(var(--rgb-ink) / 0.1)` — never `*-white/…` or `rgba(255,255,255,…)`. Ink is near-white in dark themes and dark slate in Slate Mist. White is only for content on a colored/gold surface (button text, calendar pill overlays, card art).
- Panels/popovers: `var(--color-bg-elevated)` / `var(--color-bg-surface)`, not `#21242A`-style hexes. `<body>` must not carry an inline background.
- Per-theme border tuning lives in the `html.charcoal-slate|slate-mist .border-ink\/…` override blocks in `globals.css`. `html.slate-mist` forces `color-scheme: light` on inputs (many set `colorScheme: 'dark'` inline) and sets `--seg-thumb`.
- The theme script in `app/layout.tsx` also sets `<meta name="theme-color">` so the status bar matches after a reload.

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
- Sub payment (name matches active sub, case-insensitive) → `sem-sub`
- Regular expense → `text-gold`

This applies everywhere — the per-category color mode (and its Settings toggle) was removed so every tab matches Home's minimal look.

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

**New and reworked sheets use `ui/Sheet.tsx`** — never hand-roll sheet chrome again. It renders an iOS nav bar (`Cancel` · centered title) plus a big gold primary button pinned to the bottom of the sheet from `action={{ label, onClick, disabled }}` — in thumb reach after filling the form top-down (`actionPlacement="nav"` puts it back in the nav bar for non-form sheets, e.g. `CalendarSettingsSheet`'s Done), rises with UIKit's curve (`SHEET_EASE`), drag-to-dismisses from the grabber/nav bar with flick velocity and an upward rubber band, and on ≥768px becomes a centered 540px form sheet. It portals to `<body>`, owns the body scroll lock + keyboard avoidance below, and handles Esc / ⌘Enter. Pass `scrollRef` if you need `advanceToField`. **Enter steps to the next typed field** (DOM order; dates/pickers skipped) and sets each input's `enterkeyhint` to next/done — the last field closes the keyboard on phone and runs the action on PC. iPhone's decimal pad has no Return key, so there the keyboard's ‹ › arrows do the same job; keep fields in a sensible DOM order.

Fill it with `ui/Form.tsx`: `FormGroup` (inset-grouped card; `header`/`footer`; `plain` for a control with its own surface), `FormRow` (label left, value right; `icon` + `iconColor` for a Settings-style tinted square; `chevron`), `rowInput` (class for right-aligned inputs in a row), `Toggle`, `Segmented`, `AmountHero` (big centered amount at the top of money sheets), `CategoryPicker` (tinted icon circles; `optional` lets a second tap clear), `ChoiceChips`. Pickers in rows are `<Select trigger={<FormRow … chevron>…</FormRow>}>`; dates are `CustomDateInput` with `className="sheet-date-input …"`. Colors come from `rgb(var(--rgb-ink) / α)` so every theme works.

Still on the legacy hand-rolled chrome (migrate when touched): the Edit* sheets on Out, `PaycheckSheet`, and the calendar sheets. Everything on In → Accounts is on the kit: `AddBankSheet`, `AddCardSheet`/`EditCardSheet`, `AddTransferSheet`, `BankSheet` (tap a bank: balance as the `AmountHero`, Interest group with APY / paid / next payout and a live payout preview) and `CardDetailSheet` (tap a card: the card, spent for This mo / This yr / All, its subscriptions, expenses grouped by month with Show more; Edit in the nav bar). The rules below describe what `Sheet` implements and what those legacy sheets must keep doing.

- `height: calc(100dvh - env(safe-area-inset-top, 44px) - 8px)` (not `maxHeight`) with `flex flex-col`
- Scroll area: **inline** `style={{ flex: 1, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}`
- **Never** `document.body.style.overflow = 'hidden'` — breaks iOS touch scroll
- Background lock: `body.style.position = 'fixed'` + `body.style.top = -scrollY` + `documentElement.overscrollBehavior = 'none'` + direction-aware touchmove preventDefault
- Swipe-down dismiss: direct DOM mutation on `sheetRef`. Dismiss threshold: 80px. Clear inline styles inside setTimeout *before* `onClose()`.
- Keyboard scroll: `visualViewport` resize listener pads scroll area, scrolls focused field above keyboard
- `usePullToRefresh` skips when `body.style.position === 'fixed'` — do not remove this guard. It never sets React state per touchmove (that re-rendered the whole tab every frame): it moves the floating `PullIndicator` through `indicatorRef` in a rAF and only sets state when a refresh starts/ends.
- `html, body` use `overscroll-behavior-y: contain` (keeps iOS rubber-band bounce, blocks the browser's own pull-to-refresh). Never `none` globally — that made every scroll end in a hard stop.
- `z-[60]` for sheets; `z-[70]` for RecurrencePicker above sheets; `z-[55]` for ProfileDrawer (below sheets)

Every page root `<div>` includes `tab-enter`. Routes that aren't keep-alive screens have a `loading.tsx` skeleton.

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

- `src/lib/app-prefs.ts` — `AppPrefs { defaultBankId, defaultBankName, defaultExpCat, defaultBilling }`. Read synchronously from `localStorage('hoardr-app-prefs')`; `setAppPrefs(patch)` also writes `profiles.app_prefs` (jsonb, migration `20261028_profiles_app_prefs.sql`) and `syncAppPrefs()` (run by `AuthWatcher`) pulls it down, so every device shares the same defaults. New-income sheets pick their bank with `resolveDefaultBankId(banks)` — falls back to the first bank when the saved id no longer exists.
- `src/lib/week-start.ts` — `getWeekStartsMonday()` / `setWeekStartsMonday(v)` in `localStorage('week-start-monday')`.
- **Everything a user sets follows the account.** `src/lib/ui-prefs.ts` mirrors theme, accent colors (`sem-colors`), week start, the hoard goal and hidden Google calendars to `profiles.ui_prefs` (jsonb, `20261101_security_hardening.sql`). Writers keep writing localStorage and call `pushUiPrefs()` (debounced, skipped when unchanged, **dropped until the first pull** so a screen writing its stale value on mount can't overwrite another device). `syncUiPrefs()` (from `AuthWatcher`) pulls once per load, applies theme / colors live, and fires `ui-prefs-synced` with the changed keys — Settings, `HoardChest` and the calendar's hidden-calendars state re-read on it; week start takes effect in the calendar on the next launch. Already account-backed: `calendar_prefs`, `app_prefs` (defaults), location favorites (user metadata), default card (`cards.is_default`). Device-only on purpose: calendar view mode, weather location, greeting cooldown, caches. **A new user setting must be added to `KEYS` in `ui-prefs.ts`** (or stored in the DB) or it won't sync.

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

## Picker standardization in sheets

**Dropdowns** — never use a raw `<select>`. Use `ui/Select.tsx` (same `value` / `onChange(e.target.value)` / `<option>` children): an invisible native select over the trigger on phone (iOS wheel), an app-themed menu portaled to `<body>` on large screens. Pass `trigger` for a custom row (see the calendar picker in `EditEventSheet`).

**Card picker** — all add/edit sheets (`AddTransactionSheet`, `EditTransactionSheet`, `AddSubscriptionSheet`, `EditSubscriptionSheet`) use `<Select>`. Sort the options so the current/default card appears first. Call `setDefaultCardId(cardId)` when user picks a card so it persists as the in-session default.

**Category picker** — grid of `<button>` cells (`grid-cols-4`). Active: `bg-gold/15 text-gold ring-1 ring-gold/40`. Inactive: `bg-bg-overlay text-ink-muted`. Use `text-[10px] font-semibold` **on the button itself** (not a child span) so the icon and label both inherit the active/inactive color. Always import `getCategoryIcon` (not `CategoryIcon`) for these grids.

## FAB pattern

`ui/GlobalFAB.tsx` — 56px gold button (`right: 16`, above the nav + safe area), spring press. One action → tapping runs it directly. Several → an iOS context-menu style frosted panel (portaled) springs from the button; list actions top-to-bottom with the primary one last (closest to the thumb). All tabs except Settings. Never use a header button for add actions. `primary={i}` would make a tap run that action directly and a long-press (420ms) / right-click open the menu — no screen uses it: the user wants the whole menu on a single tap.

## Calendar page architecture

Single client component (`calendar/page.tsx`), two panels on a horizontal rail: `transform: translateX(-${viewIndex * 100}vw)`. `viewIndex: 0 | 1`.

**Panel 0 mobile** — month grid (`GRID_EXPANDED = 322px` — fits a full 6-week month) + day list with drag handle. The grid is `components/calendar/MonthScroller.tsx`: **one month per page** (label + 6 week rows, page height measured from the scroller), stacked vertically with native momentum and `scroll-snap-type: y mandatory`, so every scroll rests on exactly one month (no left/right swipe). While it scrolls, only its own DOM changes — the header label is written through `gridLabelRef`, and the screen hears the new month once the scroll settles (`onSettle` → `jumpToMonth`, which moves the list) — **only for scrolls the user made** (`userDriven`). Reporting its own follow-the-list glides created a loop on upward list scrolls (the list prepends months there): each round stepped a month further back. Months set elsewhere (list scroll, Today, the picker) glide it to that month's page unless the user touched it in the last 600ms. The scroller is `position: relative` — block `offsetTop` must be measured from it (without it, offsets counted the header above and every jump hid ~2 weeks). Month blocks are memoized (keep `onPickDay`/`onSettle` stable) and use `content-visibility: auto`; ±24 months are rendered and re-centred near the ends. The handle is dragged with **native touch listeners** (`touch-action: none`, non-passive `touchmove`) that write the grid's height straight to the DOM; `snapGrid(target)` animates the snap on the DOM too and commits `gridH` to React only **after** the motion (flick > 0.3 px/ms or past halfway snaps; a tap toggles). Committing at release re-rendered thousands of rows mid-snap. **The day rows have one layout whether the grid is open or folded** (6px inset, day label one grid column wide) — they used to switch padding/label width and grow a gold vertical month rail on the left when `gridH === 0`, which shoved the whole list sideways after every collapse. Folded, the month name (`sideLbl`) takes the grabber's place in the handle bar instead; nothing below it moves, and tapping the handle opens the grid (picker and Today live in its header). React touch props + `setGridH` per move re-rendered the whole calendar per pixel, and without `touch-action: none` iOS claimed the swipe as a scroll. Day tap scrolls list via `scrollTop` (never `scrollIntoView` — fails in iOS WKWebView fixed containers). Edge-zone inter-tab: inline `p0Start`/`p0End` handlers (Studio ← Calendar → In).

**`months`** — drives infinite day list. `topSentRef`/`botSentRef` IntersectionObservers skip on large-screen month mode. The phone list renders each month as a memoized `ListMonth` block (handlers through the stable `listActions` ref) — scrolling updates screen state on every day boundary, and re-rendering every 112px row made it stall. It spans `LIST_SPAN` = ±24 months; `jumpToMonth` only rebuilds when the target is outside that range, and `handleDetailScroll` finds the month block under the line before checking days. No `content-visibility` on these blocks: Safari has no scroll anchoring, so a skipped month laying out at its real height while scrolling up shifted the list. A prepend (6 months, sentinel 1200px early) **waits until the list is at rest** (no finger down, no scroll for 140ms), then is scroll-compensated in a layout effect in the same commit (`prependFromH`, `scrollTop +=`). On iPhone a `scrollTop` write during a coasting flick is dropped: the view slid back by the inserted months, the top sentinel re-fired, and it cascaded years backwards (Sep 2026 → Mar 2022).

**The list never moves under you.** `handleDetailScroll` records the day row under the reading line and its offset (`listAnchor`); one layout effect on `[months, monthEvents]` puts that row back exactly where it was after any commit (prepends included), skipped while the list is being positioned (`suppressPrepend`, first scroll to today). Anything that changes row heights lands only **at rest** (`whenListIdle`: no finger down, no scroll for 160ms), because the re-anchoring write is dropped mid-flick. Google events: growing `months` used to refetch the whole ~4-year range and replace the map, which re-laid out the list mid-scroll ("reloads and repositions"). `gLoaded` remembers what's fetched, so an expanded range fetches only the added months and merges them (a changed calendar set / colors / `gRefreshKey` still refetches everything). `ListMonth` gets its own month's slice (`monthEvents`, identity kept while that month's events are unchanged), so an update re-renders only the months it touches.

**Desktop shell (≥768px)** — one layout for both views: sidebar (mini month that follows the grid, calendar list with color/visibility) + a toolbar (`**Month** Year` title from `deskTitle`, ‹ Today › via `deskNav`, Month/Agenda `Segmented`, filters, New). Month = the Notion grid; Agenda (`calView === 'list'`) = a day-grouped event list on the same `months` / `scrollRef` / `dayRefs` machinery as the phone list (every day keeps a zero-height ref'd anchor so `jumpToMonth` and scroll-to-today work). Agenda events open the desktop popover, not the phone sheet. Double-click a day (grid cell or agenda day) to create; a single click only clears the selection — single-click create made every click between days open the creator. The grid title samples the **middle** of the visible grid. Calendar colors come from the theme (`--color-cal-*` are mapped to theme surfaces in `globals.css`). `CalendarPopover` registers its outside-click listener once and reads `onClose` via a ref — re-registering on every parent render (cell hovers re-render the page) left it detached.

**Today** — `useToday()` (`src/lib/use-today.ts`), not a mount-time `new Date()`: kept-alive screens stay mounted overnight, so the date must tick at midnight and re-check on visibility/focus.

**`notionWeeks`** — large-screen month grid only. 48 weeks centered on today's Sunday. `addWeeks()` uses local `new Date(y, m-1, d + n*7)` (never UTC).

**Notion grid**: `MAX_VIS_EVENTS=6`, `EV_ROW_H=20`, `CELL_MIN_H=163`. Cells lay out through `layoutCell()`: each week row is one grid of `EV_ROW_H` slots, multi-day bars keep their lane, and a lane slot with no bar on that day takes the day's next single event — so days line up across the week instead of being pushed down by empty lane rows. Each day's Google events are sorted with `byStart` (all-day first, then start time) across calendars. A calendar whose fetch fails keeps its last events. `pageCache` (`cal-events` / `cal-google`) seeds first paint on revisit. Drag-and-drop: `isBeingDragged = !!dragState && !!ev.id && dragState.ev.id === ev.id` — the `!!ev.id` guard is critical; `undefined === undefined` would fade all finance pills.

**"+N more"** in a Notion-grid cell toggles that whole week row open (`expandedWeeks`, session-only state — a refresh collapses it).

**Saves are optimistic** — `handlePopoverSave` / `handleCreateEvent` / `handleEditEvent` close the UI, insert a local copy via `putLocalEvent(localGoogleEvent(...))` (creates get a `tmp-` id, which edit entry points ignore), toast, then write to Google in the background and bump `gRefreshKey`. On failure they reopen the popover/sheet with the user's edits. `'following'` scope skips the local copy and waits for the refetch.

**Location favorites/recents** — `src/lib/location-prefs.ts`. localStorage for synchronous reads, synced to the account via `auth.updateUser({ data: { cal_locations } })` (debounced) and pulled in by `syncLocationPrefs()` from `AuthWatcher` — the account's favorites win once they exist; recents merge by recency. Every location an event is saved with is pushed to recents (typed text too); while typing, saved places containing the text are listed above Google's results. Shared shared by `LocationPickerSheet` (phone / list view) and `CalendarPopover` (PC month view). Rows containing a star toggle must be `div role="button"`, never a `<button>` — nested buttons swallow the star click on desktop.

**Finance events** — `CalEvent` type: `type: 'income'|'sub'|'google'`. Custom events carry `recurrenceRule?` and `instanceDate?`.

**Recurring scopes** — `RecurScope = 'this' | 'following'`, defined once in `src/lib/calendar.ts` and re-exported by `CalendarPopover`/`EditEventSheet`. There is deliberately no `'all'`: choosing `'following'` on the first occurrence already means "all events", and the save/delete paths special-case that (they patch or delete the master directly instead of splitting).

For Supabase `cal_events`: `'this'` adds to `recurrence_exceptions`; `'following'` sets UNTIL. Both use the deferred-delete toast.

For Google events:
- Expanded instances (`singleEvents=true`) carry `recurringEventId` but **not** `recurrence` — only the master holds the RRULE. Opening an edit fires `getCalEvent(recurringEventId)` and folds the rule in asynchronously, so both the popover and the sheet must tolerate `recurrenceRule` arriving *after* mount (see the `baseRule` sync effect in `CalendarPopover` and the `lastEditId` guard in `EditEventSheet`).
- **Never put a `recurrence` array on an instance write** — Google rejects it. The shared `body` is built recurrence-free; only series-level writes attach the rule.
- `'following'` splits the series: `rruleUntilBefore()` caps the old master, then a new series is created from the split date. Modified/excepted instances after the split point are lost — same tradeoff Google's own UI makes.
- Changing the repeat rule forces scope to `'following'` (an instance has no rule of its own), and the UI disables "This event" with an inline explanation.

## Google Calendar proxy

All Google Calendar calls go through `src/app/api/calendar/route.ts` (client helpers in `src/lib/calendar.ts`). Always use `timedEvent()` / `allDayEvent()` from `src/lib/calendar.ts` — never build GCal `dateTime` strings manually. The route caches Google access tokens per refresh token while the instance is warm (one mint per burst), fetches events with `timeZone=America/Los_Angeles` (the client reads wall-clock time straight off `dateTime`), and pages through `nextPageToken`. Moves (drag-and-drop) PATCH only `start`/`end` — a PUT replaces the event and wipes location/notes/reminders. Google all-day `end.date` is exclusive (`shiftedTimes()` in the calendar page keeps durations on move/paste).
