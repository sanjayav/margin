# Margin — Packaging, Modules & Entitlements (System Design)

How Margin is sold and enforced: **one country = one module**, **AI = a cross-cutting
add-on**. A customer who buys "EU" gets the EU module; once they buy AI, it works inside
every module they own. This document is the source of truth for the commercial model,
the entitlement contract, and where it is enforced in the code.

---

## 1. The commercial model (SKUs)

| SKU | Type | Unlocks |
|---|---|---|
| `mod.EU` / `mod.IN` / `mod.AU` / `mod.UK` | Module (recurring) | That regime's engine + data + screens |
| `addon.ai` | Add-on (recurring) | "Ask Margin" across **every owned module** |
| `bundle.global` | Bundle | All four modules at a discount |

- **Modules are independent** — buy one, several, or all. The country switcher only shows owned modules.
- **AI is horizontal** — priced once, usable everywhere the org has a module. It is never sold per-country.
- **Tiers (phase 2):** each module can have `core` (Analyze + Data) vs `pro` (Pooling optimiser, Forecast, board exports). Start with a single tier per module to keep it simple.

---

## 2. The entitlement — the one object the app trusts

Everything downstream reads this. It is **server-issued and signed**; the client never decides its own access.

```ts
interface Entitlement {
  orgId: string
  modules: CountryId[]                 // ['EU','UK']  — owned country modules
  ai: boolean                          // AI add-on active
  tier: Partial<Record<CountryId, 'core' | 'pro'>>
  aiQuota?: { limit: number; used: number; resetAt: string }  // if AI is metered
  status: 'active' | 'trialing' | 'past_due' | 'canceled'
  validUntil: string                   // ISO; hard expiry
}
```

It is **computed from Stripe**, **cached in Neon**, and **embedded as short-TTL signed claims** in the session so most requests don't hit the DB.

---

## 3. Architecture

```
  Browser (Margin SPA)
    │   session cookie  →  signed entitlement claims (TTL ~10 min)
    ▼
  /api/*  (Vercel functions)
    │   guard(req, need)  ──►  verify claims  ──►  403 / 200
    │                                   │ (cache miss / refresh)
    ▼                                   ▼
  engine + AI                     Neon: orgs · users · subscriptions · entitlements · ai_usage
                                        ▲
  Stripe (Checkout + Portal)  ──webhook──►  /api/billing/webhook  ──►  recompute entitlement
```

**Four components:**

1. **Identity / tenancy** — users belong to an **org** (the paying customer). Replace today's single demo credential with real auth. Recommended: a managed provider with org support (Clerk / WorkOS / Auth0) so SSO, invites, and seats come for free; a lightweight Neon `users` + JWT also works if you want zero vendors.
2. **Billing** — Stripe. Each SKU is a Stripe Product/Price. **Checkout** for self-serve purchase, **Customer Portal** for self-management. Webhooks (`customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`) recompute the entitlement.
3. **Entitlement service** — `getEntitlement(orgId)` reads Neon (the source of truth) and returns the object. Written on every webhook; read into the session as signed claims.
4. **Enforcement** — two layers, only one of which is trusted:
   - **Client gating (UX only):** hide/lock un-owned modules, show upgrade CTAs, lock the AI panel. *Never* a security boundary — the SPA is public.
   - **Server enforcement (the real gate):** every data/AI route validates the entitlement. **This is the only thing that actually protects revenue.**

---

## 4. Enforcement mapped onto the existing code

The current code is already shaped for this:

| Surface | Today | Gated form |
|---|---|---|
| Country switcher / `PACK_LIST` | all 4 shown | filter to `entitlement.modules`; others render a locked "Upgrade" tile |
| `store.loadFleet()` | fetches all 4 | fetch only owned modules |
| `GET /api/fleet?country=XX` | open | `guard(req,{ module: 'XX' })` → 403 if not owned |
| `POST /api/ask` | open (key only) | `guard(req,{ ai: true })` **and** restrict the analyst's tools to owned modules (it can't answer about a country you don't own); meter the call into `ai_usage` |
| `GET /api/refresh` (cron) | open | system-level, unchanged |
| Rule packs `rulepacks/{eu,in,au,uk}` | static import | each *is* a module's engine — load per entitlement |

A single `guard()` helper in `api/_auth.ts` does the work:

```ts
// pseudo
export function guard(req, need: { module?: CountryId; ai?: boolean; tier?: 'pro' }) {
  const ent = verifyClaims(req)                 // throws 401 if no/!valid session
  if (need.module && !ent.modules.includes(need.module)) throw new HttpError(403, 'module_not_owned')
  if (need.ai && !ent.ai) throw new HttpError(403, 'ai_not_subscribed')
  if (need.tier === 'pro' && ent.tier[need.module!] !== 'pro') throw new HttpError(403, 'tier')
  return ent
}
```

---

## 5. Technical packaging — "module by module" in the build

So an EU-only customer doesn't download India/Australia/UK:

- **Lazy-load per country**: rule packs and country-specific screens become dynamic imports keyed by `CountryId` (`await import('./rulepacks/eu')`). The SPA loads only the chunks for owned modules.
- **Shared core** (engine, charts, Assumptions, Data viewer, AI client) is one common chunk for everyone.
- Enforcement stays **server-side** regardless of which chunks load — code-splitting is for performance and clean separation, not security.
- This mirrors the commercial model 1:1 and lets each module be **versioned independently** (e.g. ship an EU 2026 rule-pack update without touching AU).

---

## 6. Data model (Neon)

```sql
orgs(id, name, stripe_customer_id, created_at)
users(id, org_id, email, role)                       -- role: owner|member
subscriptions(id, org_id, stripe_sub_id, sku, status, current_period_end)
entitlements(org_id PRIMARY KEY, modules text[], ai bool, tier jsonb,
             ai_limit int, status text, valid_until timestamptz, updated_at)
ai_usage(id, org_id, user_id, ts, model, in_tokens, out_tokens, cost_cents)
```

`entitlements` is a **materialized cache** rebuilt by the webhook from `subscriptions`; it's what `getEntitlement` reads.

---

## 7. The AI add-on specifics

- **Gate:** requires `ai === true`.
- **Scope:** the analyst is told (in its system prompt / tool inputs) **only the owned modules**, so it can't reason about a country the org hasn't bought — the horizontal add-on still respects the module boundary.
- **Metering:** every `/api/ask` logs tokens → `ai_usage`. Enforce `aiQuota` if metered; surface usage in the billing screen.
- **Pricing options:** (a) **flat add-on + fair-use cap** — simplest, predictable; (b) **metered per query/token** — aligns cost, more billing work. Recommend (a) first, add (b) later.

---

## 8. Migration path from today

Today: demo credential, no billing, all countries open. Ship in slices, each independently useful:

1. **Auth + tenancy** — orgs/users replace the demo cred; seed an all-access entitlement for the existing demo org so nothing breaks.
2. **`guard()` + claims** — add server enforcement to `/api/fleet` and `/api/ask`; embed entitlement claims in the session.
3. **Client gating** — country switcher + nav + AI panel read the entitlement; locked tiles + upgrade CTAs.
4. **Stripe** — products, Checkout, Customer Portal, webhook → entitlement recompute.
5. **Code-split** — lazy-load country chunks.
6. **AI metering** — usage table + quota + billing view.

Steps 1–3 make the system *enforceable* (you could provision entitlements by hand and sell today). Steps 4–6 make it *self-serve and packaged*.

---

## 9. Decisions to confirm

- **Go-to-market:** self-serve (Stripe Checkout online) vs sales-led (you provision entitlements / invoice manually). Changes how much billing automation to build first.
- **Auth depth:** full multi-tenant orgs + SSO (enterprise) vs simple per-user accounts.
- **AI pricing:** flat add-on vs metered.

Defaults if unspecified: **sales-led provisioning + simple org auth + flat AI add-on** for v1 (fastest to revenue, enforceable), with Stripe self-serve and metering as fast-follows.
