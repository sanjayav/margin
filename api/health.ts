// Minimal diagnostic endpoint — no imports. If this works but /api/fleet does
// not, the crash is in the imported modules, not the platform/runtime.
export default function handler(_req: any, res: any) {
  res.status(200).json({
    ok: true,
    node: process.version,
    onVercel: !!process.env.VERCEL,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
  })
}
