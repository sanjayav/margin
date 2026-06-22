import type { CountryId, RulePack } from '../types.js'
import { EU } from './eu.js'
import { IN } from './india.js'
import { AU } from './australia.js'
import { UK } from './uk.js'

export const RULE_PACKS: Record<CountryId, RulePack> = { EU, IN, AU, UK }
export const PACK_LIST: RulePack[] = [EU, IN, AU, UK]
export const getPack = (id: CountryId) => RULE_PACKS[id]
export { EU, IN, AU, UK }
