import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { CollectionsPage } from './CollectionsPage';

describe('CollectionsPage', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  afterEach(cleanup);

  // The title carried a class that no stylesheet defines, so it rendered as
  // unstyled body text beside pages whose titles are 18px semibold.
  it('titles the page with the shared page-title treatment', () => {
    render(<CollectionsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Collections' })).toHaveClass('type-title');
  });
});
