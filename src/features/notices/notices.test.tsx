import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NoticeHost, pushNotice, reportExportResult, runExport, useNoticeStore } from '@/features/notices';

describe('action notices', () => {
  beforeEach(() => useNoticeStore.getState().clear());
  afterEach(cleanup);

  it('reports a resolved export failure with the bridge message', () => {
    expect(reportExportResult({ success: false, error: 'EACCES' })).toBe(false);
    expect(useNoticeStore.getState().notices).toEqual([
      expect.objectContaining({ tone: 'error', message: 'Export failed: EACCES' }),
    ]);
  });

  it('stays quiet on success unless a success message is given', () => {
    expect(reportExportResult({ success: true })).toBe(true);
    expect(useNoticeStore.getState().notices).toHaveLength(0);
    reportExportResult({ success: true }, { successMessage: 'Exported 3 files.' });
    expect(useNoticeStore.getState().notices[0]).toMatchObject({ tone: 'success' });
  });

  it('reports thrown export errors too', async () => {
    expect(await runExport(() => Promise.reject(new Error('IPC closed')))).toBe(false);
    expect(useNoticeStore.getState().notices[0].message).toBe('Export failed: IPC closed');
  });

  it('renders notices with alert semantics and dismisses them', () => {
    render(<NoticeHost />);
    act(() => {
      pushNotice('error', 'Copy failed');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Copy failed');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('auto-dismisses after a timeout', () => {
    vi.useFakeTimers();
    try {
      render(<NoticeHost />);
      act(() => {
        pushNotice('info', 'Saved');
      });
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
      act(() => {
        vi.advanceTimersByTime(7000);
      });
      expect(screen.queryByText('Saved')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
