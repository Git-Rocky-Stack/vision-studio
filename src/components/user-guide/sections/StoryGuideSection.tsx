import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function StoryGuideSection() {
  return (
    <UserGuideSection
      id="guide-story"
      title="Story"
      summary="Plan the board, import scripts, manage scene references, and hand scenes off to the timeline."
    >
      <GuideList
        items={[
          <span>
            Story manages scene cards, prompts, ordering, transitions, scene references, characters,
            and reusable board context for the active project.
          </span>,
          <span>
            Character and Element libraries stay attached to the project so scenes can share visual
            language without duplicating setup across every card.
          </span>,
          <span>
            Use <strong>Build Timeline</strong> for the full project or <strong>Send To Timeline</strong>{' '}
            from an individual scene when you want to advance selected story beats into editorial.
          </span>,
        ]}
      />

      <GuideCallout title="Script Import Review">
        <GuideList
          items={[
            <span>
              <strong>Import Script</strong> creates a draft review flow instead of silently writing
              scenes into the board.
            </span>,
            <span>
              Review accepted scenes and accepted elements, then commit the draft once the structure
              is clean enough to become real storyboard content.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="References Stay Scoped">
        <p>
          Board references hold project-wide style and character guidance. Scene references stay
          attached to the currently selected scene, so downstream Generate and Timeline work can
          inherit the right context automatically.
        </p>
      </GuideCallout>
    </UserGuideSection>
  );
}
