---
name: verify
description: Build, launch and drive the Underline/Autocred app headless to verify UI changes end-to-end.
---

# Verifying Underline (Autocred AI) changes

## Build + launch
- `npm run build` — tsc + vite bundle (type gate).
- `npm run dev` (background) — serves UI **and** the local /api backend at `http://localhost:5180`.

## Drive it headless
No Playwright in the project. Install `playwright-core` in a scratch dir and use the
system Chrome channel — no browser download needed:

```js
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
```

- Login is gated: click the **"Use demo credentials"** button, then **Sign in**
  (creds live in `src/state/store.ts` as `CRED`).
- After login you land on the platform **Home**; open a module via the ⌘K palette
  (`Meta+KeyK`) or the module cards. Workspace ready when `text=Gap to the line` appears.
- Sidebar nav buttons' accessible names include the tier tag (e.g. "Data CORE") —
  match with `{ name: /^Data/ }`, never `exact: true`.
- Wait ~1s after navigation before screenshots: rise/count-up animations settle.
- Capture `page.on('console')` + `pageerror` — the app should log **zero** errors.

## Flows worth driving
login → home → ⌘K open/filter/Enter (module + manufacturer jump) → Analyze drill
breadcrumb → Scenario tab (segmented control) → Data table. Esc must close the
palette; junk query shows the "Nothing matches" empty state.
