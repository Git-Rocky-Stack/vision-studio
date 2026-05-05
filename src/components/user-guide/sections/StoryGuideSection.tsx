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
              'Story works in the context of the active project. Use the project switcher in the header to create a fresh project or open a recent one -- Story panel inherits whatever project is active.',
          },
          {
            title: 'Add scene cards',
            description:
              'Click the add-scene control in the Story panel. Each card holds a scene title, prompt, optional notes, scene-level references, character assignments, and a transition to the next scene.',
          },
          {
            title: 'Assign characters and elements',
            description:
              'Build out the Character library and Element library once at the project level. Assign characters to scenes via the chip control on each card so generated stills inherit the right visual language.',
          },
          {
            title: 'Pick transitions and order scenes',
            description:
              'Drag scenes to reorder them. Use the transition indicator between cards to choose how each scene flows into the next -- cuts, dissolves, and named transitions are surfaced on both Story and Timeline so the intent travels with the scene.',
          },
          {
            title: 'Generate or send to timeline',
            description:
              'Generate a still per card from the card itself, or use Build Timeline to derive one clip per approved scene into a project sequence. Beat markers and reference context come along automatically.',
          },
        ]}
      />

      <GuideCallout title="Script Import Review" tone="info">
        <GuideStepList
          steps={[
            {
              title: 'Open Import Script',
              description:
                'Use Import Script from the Story toolbar. Paste a script or load a text file -- the importer parses it into a draft set of scenes and elements rather than writing directly into the live board.',
            },
            {
              title: 'Review parsed scenes and elements',
              description:
                'The draft review surface lists each candidate scene and element. Toggle each on or off, edit titles and prompts inline, and reassign elements between scenes if the parser guessed wrong.',
            },
            {
              title: 'Commit the draft',
              description:
                'Once the structure looks right, commit the draft. Accepted scenes are appended to the project board; accepted elements are merged into the Element library. Rejected items are discarded.',
            },
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Characters &amp; Elements" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Characters</strong> hold a name, reference imagery, and the prompt language
              that defines them visually. Assigning a character to a scene injects their language
              into that scene&apos;s downstream generation.
            </span>,
            <span>
              <strong>Elements</strong> are reusable concepts (locations, props, motifs) you want
              to keep visually consistent across multiple scenes without re-typing the same prompt
              fragment.
            </span>,
            <span>
              Both libraries are project-scoped -- duplicating a project copies its libraries so
              you can fork visual language without polluting the original.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="References Stay Scoped" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Project (board) references</strong> hold project-wide style and character
              guidance -- apply once, inherit everywhere.
            </span>,
            <span>
              <strong>Scene references</strong> stay attached to the currently selected scene, so
              downstream Generate and Timeline work can inherit the right context automatically.
            </span>,
            <span>
              <strong>Current-run references</strong> are the most ephemeral -- they only affect
              the next generation request and do not persist on the board.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="From Story To Timeline" tone="accent">
        <GuideList
          items={[
            <span>
              <strong>Build Timeline</strong> creates or reuses a project sequence and derives one
              clip per approved scene, in scene order, with transition data and reference context
              preserved.
            </span>,
            <span>
              <strong>Send To Timeline</strong> from an individual scene appends just that scene as
              a new clip -- useful when the rest of the project has already been edited and you only
              want to advance one beat.
            </span>,
            <span>
              Once clips exist on the timeline, the Clip Inspector exposes the storyboard
              context, so you can navigate back to the originating scene without losing your edit
              focus.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
