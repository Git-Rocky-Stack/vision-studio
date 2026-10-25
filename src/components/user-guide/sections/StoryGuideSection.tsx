import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { GuideStepList } from '../GuideStepList';
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
            Story manages scene cards, prompts, ordering, transitions, scene references,
            characters, and reusable board context for the active project.
          </span>,
          <span>
            Character and Element libraries stay attached to the project so scenes can share
            visual language without duplicating setup across every card.
          </span>,
          <span>
            Use <strong>Build Timeline</strong> for the full project or{' '}
            <strong>Send To Timeline</strong> from an individual scene when you want to advance
            selected story beats into editorial.
          </span>,
        ]}
      />

      <GuideStepList
        steps={[
          {
            title: 'Create or open a project',
            description:
              'Story works in the context of the active project. Use the project switcher in the header to create, rename, or open a project; with no project open, Story offers New Project.',
          },
          {
            title: 'Add scene cards',
            description:
              'Use Add Scene in the Story toolbar. Each card holds a scene name, prompt, scene-level references, assigned characters, and a transition to the next scene. Scene cards can be duplicated or deleted from their own buttons.',
          },
          {
            title: 'Assign characters and elements',
            description:
              'Build the Character and Element libraries once at the project level. With a scene selected, click a character card in the library to assign it to that scene (click again to remove it); assigned characters show as chips on the scene card.',
          },
          {
            title: 'Pick transitions and order scenes',
            description:
              'Drag a scene by its handle, or use Move scene up and Move scene down, to reorder. Click the transition indicator between cards to cycle through Cut, Fade, Dissolve, Wipe Left, Wipe Right, and Zoom.',
          },
          {
            title: 'Send to timeline',
            description:
              'Use Build Timeline to derive one clip per scene into the project sequence, or the Send scene to timeline button on a single card. Beat markers and reference context come along automatically.',
          },
        ]}
      />

      <GuideCallout title="Script Import Review" tone="info">
        <GuideStepList
          steps={[
            {
              title: 'Open Import Script',
              description:
                'Use Import Script in the Story toolbar and paste screenplay pages, an outline, or a rough brief. The importer stages a draft of scenes and elements instead of writing directly into the live board.',
            },
            {
              title: 'Review parsed scenes and elements',
              description:
                'The review surface lists each candidate scene and element. Accept or drop each one, edit scene names, prompt seeds, and summaries, edit element names, and remove element links from a scene if the parser guessed wrong.',
            },
            {
              title: 'Commit the draft',
              description:
                'Choose Commit to Storyboard once the structure looks right (or Commit Draft from the draft banner). Accepted scenes are added to the project board and accepted elements to the Element library; dropped items are discarded. Discard Draft throws the whole draft away.',
            },
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Characters &amp; Elements" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Characters</strong> hold a name, a description, and reference images, with
              per-feature locks. A character card shows how many scenes use it.
            </span>,
            <span>
              <strong>Elements</strong> are reusable concepts (characters, locations, objects,
              styles) you want to keep visually consistent across multiple scenes without
              re-typing the same prompt fragment.
            </span>,
            <span>
              Both libraries are project-scoped, so each project keeps its own visual language.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="References Stay Scoped" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Project (board) references</strong> hold project-wide style and character
              guidance: apply once, inherit everywhere.
            </span>,
            <span>
              <strong>Scene references</strong> stay attached to the currently selected scene, so
              downstream Generate and Timeline work can inherit the right context automatically.
            </span>,
            <span>
              <strong>Current-run references</strong> are the most ephemeral: they only affect the
              next generation request and do not persist on the board.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="From Story To Timeline" tone="accent">
        <GuideList
          items={[
            <span>
              <strong>Build Timeline</strong> creates or reuses the project sequence and derives
              one clip per scene, in scene order. A scene with no frame yet gets a placeholder
              clip, and scenes that already have a clip are updated instead of duplicated.
            </span>,
            <span>
              <strong>Send To Timeline</strong> from an individual scene does the same for just
              that scene, which is useful when the rest of the project has already been edited.
            </span>,
            <span>
              After a build, a status banner summarizes what was added, updated, or skipped and
              offers a button to open the timeline.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
