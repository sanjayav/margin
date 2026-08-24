// The EU module. Everything this market shows, in this market's language.
import { defineMarket } from '../types'
import EUBrief from './screens/Brief'
import EUOverview from './screens/Overview'
import EUAnalyse from './screens/Analyse'
import EUPlan from './screens/Plan'
import EUData from './screens/Data'
import Pooling from '../../screens/Pooling'
import CreditBook from '../../screens/CreditBook'
import Pricing from '../../screens/Pricing'
import Forecast from '../../screens/Forecast'

export default defineMarket({
  id: 'EU',
  // The EU pools (Article 6) and its law is in flux (2025/1214), so both are
  // sellable here. `planning` splits the forward capability out for the planning
  // team's budget; the compliance team's base is the position and the filing.
  sellableAddons: ['pooling', 'planning', 'radar'],
  name: 'European Union',
  regulation: 'Reg (EU) 2019/631 · 2023/851 · 2025/1214',
  home: 'brief',
  nav: [
    // Five destinations, not eight. Forecast, Pooling, Headroom and Pricing are
    // not separate jobs — they are ways of looking at a plan — so they become
    // panels inside Plan rather than places to navigate to. They stay routable
    // for deep links and for the agent.
    { group: 'Compliance', modules: ['brief', 'analyse', 'scenario'] },
    { group: 'Evidence', modules: ['data'] },
  ],
  modules: {
    brief: { id: 'brief', label: 'Brief', icon: 'gauge', purpose: 'What needs you today', component: EUBrief, ownsChrome: true },
    // Kept routable while Analyse absorbs it — reachable by link and by the
    // agent, but no longer a destination in the nav.
    overview: { id: 'overview', label: 'Position', icon: 'scatter', purpose: 'Where the market sits against the line', component: EUOverview, hidden: true },
    analyse: { id: 'analyse', label: 'Analyse', icon: 'scatter', purpose: 'Drill from the market to a single variant', component: EUAnalyse, ownsChrome: true },
    scenario: { id: 'scenario', label: 'Plan', icon: 'sliders', purpose: 'Model a fleet change and price it', component: EUPlan, ownsChrome: true },
    forecast: { hidden: true, id: 'forecast', label: 'Forecast', icon: 'trending', purpose: 'The exposure to 2035, under driver assumptions', component: Forecast, addon: 'planning' },
    pooling: { hidden: true, id: 'pooling', label: 'Pooling', icon: 'handshake', purpose: 'Article 6 — who can carry whom, and what it is worth', component: Pooling, addon: 'pooling',
      // Computed, not claimed: what Article 6 would remove from THIS customer's
      // exposure. Wired lazily so a locked module never runs the optimiser.
      value: () => null },
    creditbook: { hidden: true, id: 'creditbook', label: 'Headroom', icon: 'scale', purpose: 'Surplus and shortfall by manufacturer', component: CreditBook },
    pricing: { hidden: true, id: 'pricing', label: 'Pricing', icon: 'card', purpose: 'What compliance costs per car', component: Pricing },
    data: { id: 'data', label: 'Data', icon: 'database', purpose: 'Every registration behind the numbers', component: EUData, ownsChrome: true },
  },
})
