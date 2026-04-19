import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.queryByText('All good')).not.toBeInTheDocument();
    expect(screen.getByText('Test explosion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('displays a custom fallback label', () => {
    render(
      <ErrorBoundary fallbackLabel="Canvas crashed">
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText('Canvas crashed')).toBeInTheDocument();
  });

  it('recovers when Retry is clicked and children stop throwing', async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    function ConditionalChild() {
      if (shouldThrow) throw new Error('Boom');
      return <div>Recovered</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ConditionalChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Boom')).toBeInTheDocument();

    // Stop throwing before clicking retry
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: /retry/i }));

    // After retry the boundary should re-render children
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});
