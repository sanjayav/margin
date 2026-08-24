// The EU module. Everything this market shows, in this market's language.
import { defineMarket } from '../types'
import EUOverview from './screens/Overview'
import Analyze from '../../screens/Analyze'
import Scenario from '../../screens/Scenario'
import Data from '../../screens/Data'
import Pooling from '../../screens/Pooling'
import CreditBook from '../../screens/CreditBook'
import Pricing from '../../screens/Pricing'
import Forecast from '../../screens/Forecast'

export default defineMarket({
  id: 'EU',
  name: 'European Union',
  regulation: 'Reg (EU) 2019/631 · 2023/851 · 2025/1214',
  home: 'overview',
  nav: [
    { group: 'Compliance', modules: ['overview', 'analyse', 'scenario', 'forecast'] },
    // The EU issues no compliance credit — Article 6 shares one fleet average.
    // "Credit book" is kept because headroom still has value, but pooling is the
    // instrument here, so it leads.
    { group: 'Market', modules: ['pooling', 'creditbook', 'pricing'] },
    { group: 'Utilities', modules: ['data'] },
  ],
  modules: {
    overview: { id: 'overview', label: 'Overview', icon: 'gauge', purpose: 'Where the market sits against the line, and what it costs', component: EUOverview },
    analyse: { id: 'analyse', label: 'Analyse', icon: 'scatter', purpose: 'Drill from the market to a single variant', component: Analyze },
    scenario: { id: 'scenario', label: 'Plan', icon: 'sliders', purpose: 'Model a fleet change and price it', component: Scenario },
    forecast: { id: 'forecast', label: 'Forecast', icon: 'trending', purpose: 'The exposure to 2035, under driver assumptions', component: Forecast },
    pooling: { id: 'pooling', label: 'Pooling', icon: 'handshake', purpose: 'Article 6 — who can carry whom, and what it is worth', component: Pooling, addon: true },
    creditbook: { id: 'creditbook', label: 'Headroom', icon: 'scale', purpose: 'Surplus and shortfall by manufacturer', component: CreditBook },
    pricing: { id: 'pricing', label: 'Pricing', icon: 'card', purpose: 'What compliance costs per car', component: Pricing },
    data: { id: 'data', label: 'Data', icon: 'database', purpose: 'Every registration behind the numbers', component: Data },
  },
})
