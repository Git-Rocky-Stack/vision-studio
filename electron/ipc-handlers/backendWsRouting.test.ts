import { describe, expect, it, vi } from 'vitest';

import { routeBackendWsMessage } from './backendWsRouting';

describe('routeBackendWsMessage', () => {
  it('routes job_update to generation:progress', () => {
    const send = vi.fn();
    const message = { type: 'job_update', job_id: 'j1', status: 'processing', progress: 10 };

    routeBackendWsMessage(JSON.stringify(message), send);

    expect(send).toHaveBeenCalledWith('generation:progress', message);
  });

  it('routes step_image to generation:step-image', () => {
    const send = vi.fn();
    const message = {
      type: 'step_image',
      job_id: 'j1',
      step: 3,
      total_steps: 25,
      image: 'data:image/jpeg;base64,AA',
    };

    routeBackendWsMessage(JSON.stringify(message), send);

    expect(send).toHaveBeenCalledWith('generation:step-image', message);
  });

  it('drops unknown message types', () => {
    const send = vi.fn();
    routeBackendWsMessage(JSON.stringify({ type: 'mystery' }), send);
    expect(send).not.toHaveBeenCalled();
  });

  it('drops malformed JSON without throwing', () => {
    const send = vi.fn();
    expect(() => routeBackendWsMessage('{not json', send)).not.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
