import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';

import { ElementLibrary } from './ElementLibrary';

function resetStore() {
  useAppStore.setState(useAppStore.getInitialState());
}

describe('ElementLibrary', () => {
  beforeEach(() => {
    cleanup();
    resetStore();
  });

  it('renders an empty state when the project has no elements', () => {
    const project = useAppStore.getState().createProject('Storyboard');

    render(<ElementLibrary projectId={project.id} />);

    expect(screen.getByText('No Elements yet')).toBeInTheDocument();
    expect(screen.getByText(/Approved script imports will start building/i)).toBeInTheDocument();
  });

  it('renders usage counts and lets users jump to linked scenes', async () => {
    const user = userEvent.setup();
    const project = useAppStore.getState().createProject('Storyboard');
    const firstScene = useAppStore.getState().addScene(project.id, {
      name: 'Control Room',
      elementIds: ['element-character-1', 'element-location-1'],
    });
    useAppStore.getState().addScene(project.id, {
      name: 'Rooftop Exit',
      elementIds: ['element-character-1'],
    });

    useAppStore.setState((state) => ({
      projects: state.projects.map((item) =>
        item.id !== project.id
          ? item
          : {
              ...item,
              elements: [
                {
                  id: 'element-character-1',
                  projectId: project.id,
                  type: 'character',
                  name: 'Captain Nova',
                  aliases: [],
                  description: 'Lead pilot.',
                  tags: [],
                  continuityNotes: 'Keep the flight jacket silhouette consistent.',
                  referenceSetIds: ['reference-set-1'],
                  heroMediaAssetId: null,
                  status: 'approved',
                  color: '#e63946',
                  metadata: {},
                },
                {
                  id: 'element-location-1',
                  projectId: project.id,
                  type: 'location',
                  name: 'Control Room',
                  aliases: [],
                  description: 'Night command deck.',
                  tags: [],
                  continuityNotes: '',
                  referenceSetIds: [],
                  heroMediaAssetId: null,
                  status: 'approved',
                  color: '#4f46e5',
                  metadata: {},
                },
              ],
            },
      ),
    }));

    render(<ElementLibrary projectId={project.id} />);

    expect(screen.getByText('Captain Nova')).toBeInTheDocument();
    expect(screen.getAllByText('Control Room').length).toBeGreaterThan(0);
    expect(screen.getByText('2 scenes')).toBeInTheDocument();
    expect(screen.getByText('1 reference')).toBeInTheDocument();
    expect(
      screen.getByText('Keep the flight jacket silhouette consistent.'),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Control Room' })[0]);

    expect(useAppStore.getState().activeSceneId).toBe(firstScene.id);
  });
});
