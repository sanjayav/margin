import type { CountryId, RulePack } from '../types'
import { EU } from './eu'
import { IN } from './india'
import { AU } from './australia'
import { UK } from './uk'

export const RULE_PACKS: Record<CountryId, RulePack> = { EU, IN, AU, UK }
export const PACK_LIST: RulePack[] = [EU, IN, AU, UK]
export const getPack = (id: CountryId) => RULE_PACKS[id]
export { EU, IN, AU, UK }
