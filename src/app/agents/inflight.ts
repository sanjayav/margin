/* ───────────────────────────────────────────────────────────────────────────
   Live agent runs, so they can be stopped.
   ---------------------------------------------------------------------------
   A run is a streaming POST that can last minutes and bills the whole time.
   Until this existed the client built an AbortController, passed its signal to
   fetch, and then dropped it — so nothing could ever call abort(). A run could
   not be stopped by the user, by a navigation, or by signing out: it simply ran
   to completion and charged for it.

   This lives in its own module rather than in client.ts because the store needs
   to stop runs on sign-out, and client.ts already reads the store. Putting the
   registry between them keeps that a one-way dependency.

   Stopping is best-effort by design. Aborting the fetch closes the connection,
   and the server watches for that and abandons the turn loop — but a request
   already in flight to the model is paid for either way. Stopping bounds the
   spend, it does not refund it.
   ─────────────────────────────────────────────────────────────────────────── */

const inflight = new Map<string, AbortController>()

/** Called by the client as a run starts. */
export function register(runId: string, ctl: AbortController): void {
  inflight.set(runId, ctl)
}

/** Called when a run ends, however it ended. */
export function release(runId: string): void {
  inflight.delete(runId)
}

/** True while the run is still streaming — the only state a stop button needs. */
export function isInflight(runId: string): boolean {
  return inflight.has(runId)
}

export function inflightCount(): number {
  return inflight.size
}

/** Stop one run. Safe to call for a run that has already finished. */
export function stopRun(runId: string): void {
  const ctl = inflight.get(runId)
  if (!ctl) return
  inflight.delete(runId)
  ctl.abort()
}

/**
 * Stop everything. Used on sign-out: an agent started by the person leaving
 * must not keep running — and keep spending — against a session that no longer
 * exists, least of all while someone else is at the machine.
 */
export function stopAllRuns(): void {
  // Copy first: abort() runs the client's catch and finally synchronously,
  // which calls release() and would otherwise mutate the map mid-iteration.
  const live = [...inflight.values()]
  inflight.clear()
  for (const ctl of live) ctl.abort()
}
