import { describe, expect, it } from 'vitest';

import {
  makePollErrorBudget,
  recordPollError,
  recordPollSuccess,
} from './pollErrorBudget';

describe('pollErrorBudget', () => {
  // Background: GeneratePanel polls electron.generation.getStatus every
  // ~1-2s while a job runs. A persistent backend outage used to leave
  // the loop retrying forever. The budget caps consecutive errors so
  // the UI can give up cleanly after the cap is reached.

  it('starts at zero', () => {
    const budget = makePollErrorBudget(5);
    expect(budget.consecutive).toBe(0);
    expect(budget.cap).toBe(5);
  });

  it('increments consecutive on error and is not exhausted below cap', () => {
    let budget = makePollErrorBudget(3);
    let result = recordPollError(budget);
    budget = result.budget;
    expect(budget.consecutive).toBe(1);
    expect(result.exhausted).toBe(false);

    result = recordPollError(budget);
    budget = result.budget;
    expect(budget.consecutive).toBe(2);
    expect(result.exhausted).toBe(false);
  });

  it('reports exhausted when the cap is reached', () => {
    let budget = makePollErrorBudget(3);
    budget = recordPollError(budget).budget;
    budget = recordPollError(budget).budget;
    const last = recordPollError(budget);
    expect(last.budget.consecutive).toBe(3);
    expect(last.exhausted).toBe(true);
  });

  it('resets the counter on success', () => {
    let budget = makePollErrorBudget(3);
    budget = recordPollError(budget).budget;
    budget = recordPollError(budget).budget;
    expect(budget.consecutive).toBe(2);
    budget = recordPollSuccess(budget);
    expect(budget.consecutive).toBe(0);
    expect(recordPollError(budget).exhausted).toBe(false);
  });

  it('treats a flapping connection as recoverable', () => {
    // 4 errors then success then 4 more should not trip a cap of 5.
    let budget = makePollErrorBudget(5);
    for (let i = 0; i < 4; i += 1) {
      const result = recordPollError(budget);
      expect(result.exhausted).toBe(false);
      budget = result.budget;
    }
    budget = recordPollSuccess(budget);
    for (let i = 0; i < 4; i += 1) {
      const result = recordPollError(budget);
      expect(result.exhausted).toBe(false);
      budget = result.budget;
    }
  });
});
