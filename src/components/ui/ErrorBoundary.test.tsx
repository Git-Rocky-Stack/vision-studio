import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UI_STRINGS } from '@/constants/strings';
import { ErrorBoundary } from './ErrorBoundary';

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
        msg.includes('Boom')
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
});
