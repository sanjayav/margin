// Runner for the accuracy validation harness. `npm run validate`.
// Exits non-zero if any hard invariant or regulatory anchor fails (CI-friendly).
import { runValidation, formatReport } from '../src/engine/validate.js'

const checks = runValidation()
console.log(formatReport(checks))
process.exit(checks.some((c) => c.status === 'fail') ? 1 : 0)
