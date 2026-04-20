import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '@/store/appStore';
import { CollectionsPage } from '@/pages/CollectionsPage';

describe('CollectionsPage', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });
  afterEach(cleanup);

  it('renders the collections heading', () => {
    render(<CollectionsPage />);
    expect(screen.getByText('Collections')).toBeInTheDocument();
  });

  it('shows empty state when no collections', () => {
    render(<CollectionsPage />);
    expect(screen.getByText('No collections yet')).toBeInTheDocument();
  });

  it('renders category filter tabs', () => {
    render(<CollectionsPage />);
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Smart' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Manual' })).toBeInTheDocument();
  });

  it('creates a new collection on button click', async () => {
    const user = userEvent.setup();
    render(<CollectionsPage />);
    const newButton = screen.getByRole('button', { name: /new collection/i });
    await user.click(newButton);
    expect(useAppStore.getState().collections).toHaveLength(1);
  });

  it('displays collection cards', () => {
    useAppStore.getState().createCollection({ name: 'My Favorites', type: 'manual' });
    render(<CollectionsPage />);
    expect(screen.getByText('My Favorites')).toBeInTheDocument();
  });
});