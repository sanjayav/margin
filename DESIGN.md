# AiRE — design system

## The POV: the defensible number

Competitors all say "audit-ready". None of them *look* it. The design job is to
make defensibility visible: **one number, stated plainly, with its provenance
within reach.** Restraint is not a style choice here — a screen that looks busy
looks like it is hiding something, and this product's whole claim is that it
isn't.

Three rules follow, and they settle most arguments:

1. **One number leads.** Every screen opens with a single figure and one sentence
   of plain English. Everything else is evidence for it.
2. **Colour means something or it is absent.** Colour is reserved for DATA and
   STATUS. Chrome is greyscale. If a thing is not a measurement or a compliance
   state, it has no hue.
3. **The engine speaks, the AI narrates.** Numbers come from the engine and carry
   their source. The assistant points at them, explains them, and drives the
   workspace — it never generates a figure.

## References, and what we take from each

| Reference | What we take | What we reject |
|---|---|---|
| **Mercury / Ramp** | Trust through restraint. One clear number, not a wall of charts. | Consumer warmth; we are colder. |
| **Stripe** | Data tables and numeric typography done properly; documentation-grade clarity. | Marketing gradients. |
| **Linear** | Discipline: tight rhythm, one accent, keyboard-first, no decorative chrome. | Dark-only; our users print and present. |
| **Attio / Hex** | AI as a first-class surface — the view says what it noticed, rather than hosting a chat bubble. | Chat-as-a-widget bolted onto an old UI. |

## Surface

Light. This product's output gets exported, printed, and put in board packs, and
its readers are finance and legal. Dark is reserved for exactly one thing: the
**headline metric band** at the top of a screen, which is where the eye must land
first. Dark used everywhere (as today) spends the contrast budget on chrome.

## Tokens

Ink and surface are warm-neutral, already established and kept:
surface `#FBF7EF`, card `#FFFEFB`, ink `#1C1812` → `#8C8273`.

- **Accent — AiRE red `#E8223B`.** Used for: the primary action, the active nav
  item, and nothing else. It is not a data colour.
- **Status (reserved).** compliant `#0E9F6E` · fine `#E0484D` · warn `#D98005` ·
  exempt `#8C8273`. Always with an icon and a label; never colour alone.
- **Data.** The validated powertrain palette in `src/lib/palette.ts`
  (Okabe–Ito derived, CVD-checked against the cream surface). Never re-derive it.

## Type

Geist. Numbers are the hero, so they get the care:

- **Metric** `clamp(34px, 4vw, 52px)`, weight 800, tracking −0.03em, tabular.
- **Title** 19px/600, **Body** 13.5px/400 at 1.55 line-height, **Label** 10.5px
  uppercase, tracking 0.14em, ink-500.
- Every figure is tabular-nums. A column of numbers must align on the decimal.

## Space & rhythm

4px base. Section rhythm 24 / 32 / 48. **Whitespace does the separating, not
borders.** A card gets a border OR a shadow OR a fill — never two. Default to
none of the three and let space group things.

## Layout

240px sidebar · 12-column content grid · max content width 1200px. Screens open
with the metric band, then the answer, then the evidence. No screen has more than
**one** primary action.

## Motion

Purposeful only: 150ms for state, 250ms for entrance, 400ms for a value that
counts up because it changed. `prefers-reduced-motion` removes all of it. Nothing
loops, nothing pulses for decoration.

## Bans

- No card-inside-card-inside-card.
- No more than one accent hue on a screen.
- No decorative gradient, glow, or grain on a data surface.
- No number without a unit and a basis.
- No colour-only status.
