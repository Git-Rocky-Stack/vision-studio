import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Suspense } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UI_STRINGS } from '@/constants/strings';
import { ErrorBoundary } from './ErrorBoundary';
import { retryableLazy } from './ErrorBoundaryLazy';
import { installGlobalErrorHandlers, resetReportedNotices } from './ErrorBoundaryReporting';
import { useNoticeStore } from '@/features/notices/notices';

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test explosion');
  }
  return <div>All good</div>;
}

describe('ErrorBoundary', () => {
  // Suppress React's console.error for expected error boundary triggers
  const originalError = console.error;
  beforeAll(() => {
    console.error = (...args: unknown[]) => {
      const msg = args.map((arg) => arg instanceof Error ? arg.message : String(arg)).join(' ');
      if (
        msg.includes('Error: Uncaught') ||
        msg.includes('The above error') ||
        msg.includes('Test explosion') ||
        msg.includes('Boom') ||
        msg.includes('[renderer]') ||
        msg.includes('chunk')
      ) return;
      originalError(...args);
    };
  });
  afterEach(cleanup);
  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Child content')).toHaveTextContent('Child content');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );

    // role="alert" is what announces the failure to assistive tech, and the
    // thrown message is what makes the fallback diagnosable rather than generic.
    expect(screen.queryByText('All good')).not.toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Test explosion');
    expect(screen.getByRole('button', { name: /retry/i })).toBeEnabled();
  });

  it('sizes its controls as touch targets: Retry 44px, the details disclosure at least 32px', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /retry/i })).toHaveClass('min-h-[44px]', 'min-w-[44px]');
    expect(screen.getByText(UI_STRINGS.errors.technicalDetails)).toHaveClass('min-h-[32px]');
  });

  it('displays a custom fallback label', () => {
    render(
      <ErrorBoundary fallbackLabel="Canvas crashed">
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );

    // A custom label must REPLACE the generic heading, not sit alongside it.
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Canvas crashed');
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      UI_STRINGS.errors.somethingWentWrong
    );
  });

  it('recovers when Retry is clicked and children stop throwing', async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    function ConditionalChild() {
      if (shouldThrow) throw new Error('Boom');
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Boom');

    // Stop throwing before clicking retry
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: /retry/i }));

    // After retry the boundary must hand back to the children AND tear the
    // fallback down - a boundary that renders both has not actually recovered.
    expect(screen.getByText('Recovered')).toHaveTextContent('Recovered');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('logs a caught error with its component stack (componentDidCatch)', () => {
    const spy = vi.spyOn(console, 'error');
    render(
      <ErrorBoundary fallbackLabel="Canvas crashed">
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    const logged = spy.mock.calls.find((call) => String(call[0]).includes('[renderer] Canvas crashed'));
    expect(logged?.[1]).toBeInstanceOf(Error);
    spy.mockRestore();
  });

  it('resets when a reset key changes, so navigating away clears the fallback (#J5)', () => {
    let shouldThrow = true;
    function Child() {
      if (shouldThrow) throw new Error('Boom');
      return <div>Fresh view</div>;
    }
    const { rerender } = render(
      <ErrorBoundary resetKeys={['generate']}>
        <Child />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    shouldThrow = false;
    rerender(
      <ErrorBoundary resetKeys={['generate']}>
        <Child />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKeys={['assets']}>
        <Child />
      </ErrorBoundary>
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Fresh view')).toBeInTheDocument();
  });

  it('Retry re-imports a lazy chunk that failed instead of rethrowing the cached failure', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const load = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('Failed to fetch dynamically imported chunk');
      return { default: () => <div>Loaded view</div> };
    });
    const Lazy = retryableLazy(load);

    render(
      <ErrorBoundary onRetry={Lazy.reset}>
        <Suspense fallback={<div>Loading</div>}>
          <Lazy.Component />
        </Suspense>
      </ErrorBoundary>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('chunk');
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Loaded view')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('installGlobalErrorHandlers (#J6)', () => {
  afterEach(() => {
    useNoticeStore.getState().clear();
    resetReportedNotices();
  });

  function rejection(reason: unknown) {
    const event = new Event('unhandledrejection', { cancelable: true }) as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', { value: reason });
    return event;
  }

  it('logs an unhandled rejection and pushes one notice for a burst of the same error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stop = installGlobalErrorHandlers(window);

    window.dispatchEvent(rejection(new Error('settings.get failed')));
    window.dispatchEvent(rejection(new Error('settings.get failed')));

    expect(errorSpy).toHaveBeenCalled();
    expect(useNoticeStore.getState().notices.map((n) => n.message)).toEqual([
      'Something went wrong (unhandled promise rejection): settings.get failed',
    ]);
    stop();
    errorSpy.mockRestore();
  });

  it('treats an aborted operation as expected control flow', () => {
    const stop = installGlobalErrorHandlers(window);
    window.dispatchEvent(rejection(new DOMException('aborted', 'AbortError')));
    expect(useNoticeStore.getState().notices).toHaveLength(0);
    stop();
  });
});

