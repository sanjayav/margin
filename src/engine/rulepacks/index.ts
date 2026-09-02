import type { CountryId, RulePack } from '../types.js'
import { EU } from './eu.js'
import { IN } from './india.js'
import { AU } from './australia.js'
import { UK } from './uk.js'
import { CN } from './china.js'

export const RULE_PACKS: Record<CountryId, RulePack> = { EU, IN, AU, UK, CN }
export const PACK_LIST: RulePack[] = [EU, IN, AU, UK, CN]
export const getPack = (id: CountryId) => RULE_PACKS[id]
export { EU, IN, AU, UK, CN }

/** Does this regime keep a credit book at all? Only where an instrument moves
 *  between manufacturers. The EU issues nothing — Article 6 pooling makes
 *  members share ONE fleet average, so there is no position to bank, price or
 *  trade and no ledger to show. Those markets hide the Credit book entirely
 *  and realise headroom on Pooling instead. */
export const hasCreditBook = (id: CountryId) => RULE_PACKS[id].transfer.kind !== 'pool'
