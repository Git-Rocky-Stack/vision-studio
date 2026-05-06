/**
 * Tracks consecutive errors during a polling loop and reports when a cap
 * has been reached. Used by the renderer-side generation polling to give
 * up cleanly after a backend outage instead of retrying forever.
 *
 * Pure data shape -- the consumer (a React component / hook) decides what
 * to do on exhaustion. A reset on every successful poll means flapping
 * connections do not trip the cap as long as recovery is in between.
 */
export interface PollErrorBudget {
  consecutive: number;
  cap: number;
}

export function makePollErrorBudget(cap: number): PollErrorBudget {
  return { consecutive: 0, cap };
}

export function recordPollSuccess(budget: PollErrorBudget): PollErrorBudget {
  return { ...budget, consecutive: 0 };
}

export function recordPollError(
  budget: PollErrorBudget,
): { exhausted: boolean; budget: PollErrorBudget } {
  const next: PollErrorBudget = { ...budget, consecutive: budget.consecutive + 1 };
  return { exhausted: next.consecutive >= next.cap, budget: next };
}
