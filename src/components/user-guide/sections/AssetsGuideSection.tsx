import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { GuideStepList } from '../GuideStepList';
import { UserGuideSection } from '../UserGuideSection';

export function AssetsGuideSection() {
  return (
    <UserGuideSection
      id="guide-assets"
      title="Assets"
      summary="Review, organize, tag, and export generated media. Local and hosted output share one library."
    >
      <GuideList
        items={[
          <span>
            Assets tracks outputs from the internal app output folder as well as any custom output
            folder you configure in Settings.
          </span>,
          <span>
            Collections group assets by hand, and the AI tagging mode decides whether tags are
            derived on generation, in the background, on demand, or not at all.
          </span>,
          <span>
            Exports are checked in the main process, so media can only be copied into your
            Desktop, Documents, Downloads, Pictures, or Videos folders.
          </span>,
        ]}
      />

      <GuideStepList
        steps={[
          {
            title: 'Browse the asset library',
            description:
              'Open Assets to see every generated and imported file. Search by name, prompt, or model, filter by type (All, Image, Video, Audio), and switch between grid and list views. The grid is virtualized, so large libraries scroll smoothly.',
          },
          {
            title: 'Import outside media',
            description:
              'Use the Import button to pick external images, videos, or audio. Imports are copied into an imports folder inside your output folder, so the originals stay untouched.',
          },
          {
            title: 'Build a collection',
            description:
              'Choose New Collection on the Collections page, rename it with the pencil on its card, then use Add to collection on an asset tile in Assets or in the image preview. You can also create a new collection straight from the Add to collection menu.',
          },
          {
            title: 'Tag and analyze',
            description:
              'Pick a tagging mode that fits your workflow (see the modes below). Analysis derives style, subject, color, and mood tags from the prompt you wrote for that asset, with no cloud call and no separate model. Use Analyze on the Collections page to clear the untagged backlog.',
          },
          {
            title: 'Open, export, or delete',
            description:
              'Hover an asset tile for its buttons: favorite, open in viewer, extract frame to edit (video), export, add to collection, and delete. Click tiles to select several, then use Export in the selection bar to copy them to a folder. Delete always asks first.',
          },
        ]}
      />

      <GuideCallout title="One Library For Local And Hosted Output" tone="accent">
        <p>
          OpenRouter still-image results are written into your output folder before they are
          synced back into Assets. You do not need a separate hosted gallery to find BYOK output:
          search, collections, and tags see hosted and local results together.
        </p>
      </GuideCallout>

      <GuideCallout title="Tagging Modes" tone="info">
        <GuideList
          items={[
            <span>
              <strong>On Generation</strong> (default): every new asset is analyzed and tagged
              the moment it lands in the library.
            </span>,
            <span>
              <strong>Background Batch</strong>: new assets queue instead of being tagged as they
              land, and the queue is tagged in one pass once the app has been idle for a while.
            </span>,
            <span>
              <strong>On Demand</strong>: nothing is tagged automatically; the Analyze button on
              the Collections page shows how many assets are still untagged and tags them when you
              ask.
            </span>,
            <span>
              <strong>Off</strong>: tagging is disabled and the Analyze button reads Tagging off.
              The library still works normally for browsing, exporting, and collections.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Collections" tone="info">
        <GuideList
          items={[
            <span>
              Collections hold an explicit list of assets. Their contents only change when you add
              an asset with Add to collection or remove one from the open collection.
            </span>,
            <span>
              Click a collection card to open it below the grid; hover an asset there to remove it.
              Rename a collection with the pencil and delete it with the trash button. Deleting a
              collection never deletes its assets.
            </span>,
            <span>
              Filter the grid by All, Manual, Tagged (every member analyzed), or Untagged (analysis
              still outstanding), and search collections by name.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Tag Categories" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Style</strong>: the visual style named in the prompt (photorealistic,
              anime, watercolor, and so on).
            </span>,
            <span>
              <strong>Subject</strong>: the subject named in the prompt (portrait, landscape,
              product, character).
            </span>,
            <span>
              <strong>Color</strong>: color terms named in the prompt, each resolved to its real
              hex value.
            </span>,
            <span>
              <strong>Mood</strong>: the emotional register named in the prompt (calm, dramatic,
              energetic).
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Batch Result Management" tone="info">
        <GuideList
          items={[
            <span>
              Batch results can be sorted, filtered, exported with Export All, or removed with
              Delete All after a run.
            </span>,
            <span>
              Failed prompts keep their card and are marked failed, so you always know what
              produced what. There is no retry control; resubmit the prompt in a new batch.
            </span>,
            <span>
              Batch results are also full members of the Assets library.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Path Safety" tone="warning">
        <GuideList
          items={[
            <span>
              Reads, deletes, and reveals only resolve inside managed output folders. Imports go
              through a managed copy so external paths never become library entries directly.
            </span>,
            <span>
              Exports only land inside Desktop, Documents, Downloads, Pictures, or Videos. Your
              home folder itself is not an allowed destination; a folder outside those locations
              is rejected.
            </span>,
            <span>
              Clear Cache (Settings &gt; General) empties the internal app output folder only.
              Custom output folders are preserved, but anything stored in the internal folder,
              including imports made while no custom output folder was set, is removed.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
