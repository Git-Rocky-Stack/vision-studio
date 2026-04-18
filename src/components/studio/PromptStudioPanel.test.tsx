import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { PromptStudioPanel } from './PromptStudioPanel';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('PromptStudioPanel', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(cleanup);

  it('renders all three collapsible sections', () => {
    render(<PromptStudioPanel />);

    // Prompt Editor is open by default (defaultOpen)
    expect(screen.getByText('Prompt Editor')).toBeInTheDocument();
    expect(screen.getByText('Enhancement')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
  });

  it('renders positive and negative prompt editors when Prompt Editor section is open', () => {
    render(<PromptStudioPanel />);

    // Prompt Editor is defaultOpen, so textareas should be visible.
    // The label elements don't use htmlFor/id association, so we select by placeholder.
    expect(screen.getByPlaceholderText('Describe what you want to generate...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('What to avoid in the generation...')).toBeInTheDocument();
  });

  it('renders enhancement toolkit buttons when Enhancement section is open', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    // Enhancement section starts collapsed, so open it first
    const enhancementButton = screen.getByText('Enhancement');
    await user.click(enhancementButton);

    // Now the enhancement toolkit buttons should be visible
    expect(screen.getByTitle('Automatically improve prompt quality with AI')).toBeInTheDocument();
    expect(screen.getByTitle('Apply artistic style modifiers to prompt')).toBeInTheDocument();
    expect(screen.getByTitle('Expand prompt with additional detail keywords')).toBeInTheDocument();
    expect(screen.getByTitle('Generate smart negative prompt suggestions')).toBeInTheDocument();
  });

  it('collapses a section when its header is clicked', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    // Prompt Editor is open by default -- verify textarea is visible
    expect(screen.getByPlaceholderText('Describe what you want to generate...')).toBeInTheDocument();

    // Click the Prompt Editor header to collapse it
    const promptEditorButton = screen.getByRole('button', { name: /Prompt Editor/ });
    expect(promptEditorButton).toHaveAttribute('aria-expanded', 'true');

    await user.click(promptEditorButton);

    // Section should now be collapsed -- aria-expanded should be false
    expect(promptEditorButton).toHaveAttribute('aria-expanded', 'false');

    // Textarea should no longer be visible
    expect(screen.queryByPlaceholderText('Describe what you want to generate...')).not.toBeInTheDocument();
  });

  it('expands a collapsed section when its header is clicked', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    // Enhancement starts collapsed (defaultOpen={false})
    const enhancementButton = screen.getByRole('button', { name: /Enhancement/ });
    expect(enhancementButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(enhancementButton);

    // Now it should be expanded
    expect(enhancementButton).toHaveAttribute('aria-expanded', 'true');
  });

  it('allows typing in the positive prompt textarea', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    const positiveTextarea = screen.getByPlaceholderText('Describe what you want to generate...');
    await user.type(positiveTextarea, 'a beautiful landscape');

    expect(positiveTextarea).toHaveValue('a beautiful landscape');
  });

  it('allows typing in the negative prompt textarea', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    const negativeTextarea = screen.getByPlaceholderText('What to avoid in the generation...');
    await user.type(negativeTextarea, 'blurry, low quality');

    expect(negativeTextarea).toHaveValue('blurry, low quality');
  });

  it('renders the template library when Templates section is expanded', async () => {
    const user = userEvent.setup();
    render(<PromptStudioPanel />);

    // Templates starts collapsed
    const templatesButton = screen.getByRole('button', { name: /Templates/ });
    await user.click(templatesButton);

    // Template library should show search input
    expect(screen.getByPlaceholderText('Search templates...')).toBeInTheDocument();
  });

  it('renders token count indicators for both prompt editors', () => {
    render(<PromptStudioPanel />);

    // Both positive and negative prompt editors show 0/75 token count by default.
    // There are two instances, so use getAllByText.
    const tokenCounts = screen.getAllByText('0/75');
    expect(tokenCounts).toHaveLength(2);
  });
});