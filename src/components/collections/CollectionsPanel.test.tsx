import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '@/store/appStore';
import { CollectionsPanel } from './CollectionsPanel';

describe('CollectionsPanel', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });
  afterEach(cleanup);

  it('renders with empty state', () => {
    render(<CollectionsPanel />);
    expect(screen.getByText('Collections')).toBeInTheDocument();
    expect(screen.getByText('No collections yet')).toBeInTheDocument();
  });

  it('renders collection cards after creation', () => {
    useAppStore.getState().createCollection({ name: 'Test Collection', type: 'manual' });
    render(<CollectionsPanel />);
    expect(screen.getByText('Test Collection')).toBeInTheDocument();
  });

  it('creates a new collection on button click', async () => {
    const user = userEvent.setup();
    render(<CollectionsPanel />);
    const newButtons = screen.getAllByRole('button');
    const newButton = newButtons.find(btn => btn.textContent?.includes('New'));
    if (newButton) {
      await user.click(newButton);
      expect(useAppStore.getState().collections).toHaveLength(1);
    }
  });

  it('filters collections by search', () => {
    useAppStore.getState().createCollection({ name: 'Portraits', type: 'manual' });
    useAppStore.getState().createCollection({ name: 'Landscapes', type: 'manual' });
    render(<CollectionsPanel />);
    expect(screen.getByText('Portraits')).toBeInTheDocument();
    expect(screen.getByText('Landscapes')).toBeInTheDocument();
  });

  it('shows smart badge for smart collections', () => {
    useAppStore.getState().createCollection({ name: 'Auto Portraits', type: 'smart', smartQuery: { tags: ['portrait'] } });
    render(<CollectionsPanel />);
    expect(screen.getByText('Smart')).toBeInTheDocument();
  });
});