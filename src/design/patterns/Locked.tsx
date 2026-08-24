// ───────────────────────────────────────────────────────────────────────────
// LOCKED — an argument, not a wall.
//
// A paywall that lists features asks the customer to imagine the value. This one
// computes it from their own data, with the same engine that produces everything
// else in the product: "Article 6 pooling would remove EUR 3.50B of your EUR
// 10.77B exposure." That is not a marketing claim, it is a number they can check
// the moment they unlock it — which is the only kind of upsell this product is
// allowed to make.
//
// If the value cannot be computed, or is zero, the module says so honestly
// rather than manufacturing urgency.
// ───────────────────────────────────────────────────────────────────────────
import Icon, { type IconName } from '../../components/Icon'
import { STATUS } from '../../lib/palette'

export default function Locked({ title, purpose, icon, value, priceLabel, onUnlock }: {
  title: string
  purpose: string
  icon: IconName
  value: { headline: string; detail: string } | null
  priceLabel?: string
  onUnlock: () => void
}) {
  return (
    <div className="mx-auto max-w-[720px] py-16 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-ink-100/[0.06] text-ink-300">
        <Icon name={icon} size={22} />
      </span>
      <h1 className="font-display mt-5 text-[22px] font-bold tracking-[-0.02em] text-ink-100">{title}</h1>
      <p className="mx-auto mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-ink-500">{purpose}</p>

      {value ? (
        <div className="mx-auto mt-8 max-w-[46ch] rounded-2xl border border-black/[0.07] bg-white/70 px-7 py-6">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-ink-500">On your own data</div>
          <div className="dnum mt-2.5 text-[30px] font-extrabold tabular-nums tracking-[-0.02em]" style={{ color: STATUS.compliant }}>
            {value.headline}
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-400">{value.detail}</p>
        </div>
      ) : (
        <p className="mx-auto mt-8 max-w-[48ch] text-[12.5px] leading-relaxed text-ink-500">
          There is nothing for this module to remove at today's position — so we are not going to pretend otherwise.
          It becomes useful when a manufacturer goes over its target.
        </p>
      )}

      <button onClick={onUnlock}
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110">
        <Icon name="spark" size={15} /> Add this module{priceLabel ? ` · ${priceLabel}` : ''}
      </button>
    </div>
  )
}
