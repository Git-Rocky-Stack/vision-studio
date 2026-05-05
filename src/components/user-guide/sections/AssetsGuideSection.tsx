import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { GuideStepList } from '../GuideStepList';
import { UserGuideSection } from '../UserGuideSection';

export function AssetsGuideSection() {
  return (
    <UserGuideSection
      id="guide-assets"
      title="Assets"
      summary="Review, organize, tag, export, and recover generated media -- local and hosted output share one library."
    >
      <GuideList
        items={[
          <span>
            Assets tracks outputs from the managed internal output folder as well as any custom
            output root you configure in Settings.
          </span>,
          <span>
            Collections can be manual or smart, and AI tagging modes determine whether metadata is
            applied on generation, in the background, on demand, or not at all.
          </span>,
          <span>
            Export and reveal flows remain safe-user actions, so media can be moved into your
            normal Documents, Downloads, Pictures, or project destination without bypassing app
            safeguards.
          </span>,
        ]}
      />

      <GuideStepList
        steps={[
          {
            title: 'Browse the asset library',
            description:
              'Open Assets to see every generated and imported file across all managed output roots. Filter by type (image, video, audio), collection, or tag -- the library is virtualized so 10,000+ items scroll smoothly.',
          },
          {
            title: 'Import outside media',
            description:
              'Use Import (or drop files onto the panel) to bring external images, videos, or audio into the library. Imports are copied into the managed imports folder so the originals stay untouched and the library stays portable.',
          },
          {
            title: 'Build a collection',
            description:
              'Create a Manual collection to hand-pick assets, or a Smart collection driven by a query (prompt text, model, tags, date range, style, mood). Smart collections re-evaluate themselves whenever the library changes.',
          },
          {
            title: 'Tag and analyze',
            description:
              'Pick a tagging mode that fits your workflow (see the modes callout below). Use the Analyze action on individual assets or selections to extract dominant colors, detected style, subject, and mood. Tags can be edited and reassigned at any time.',
          },
          {
            title: 'Export, reveal, or delete',
            description:
              'Right-click an asset for Export (copy to a safe destination), Reveal in Folder, or Delete. Multi-select to bulk-export to a directory or bulk-delete with one confirm. Deletes go through the same managed-path checks as everywhere else.',
          },
        ]}
      />

      <GuideCallout title="One Library For Local And Hosted Output" tone="accent">
        <p>
          OpenRouter still-image results are written into the managed output root before they are
          synced back into Assets. Users do not need a separate hosted gallery to find BYOK
          output -- searches, smart collections, and tags all see hosted and local results
          together.
        </p>
      </GuideCallout>

      <GuideCallout title="Tagging Modes" tone="info">
        <GuideList
          items={[
            <span>
              <strong>On Generation</strong> (default) -- every new asset is analyzed and tagged
              the moment it lands in the library. Best when you want maximum searchability with no
              extra clicks.
            </span>,
            <span>
              <strong>Background Batch</strong> -- new assets queue for analysis and process during
              idle time. Best when you generate in bursts and don&apos;t want each generation to
              spend extra GPU on tagging.
            </span>,
            <span>
              <strong>On Demand</strong> -- nothing is tagged automatically; you trigger Analyze
              per asset or per selection. Best for low-VRAM machines or when most of your work
              never needs tags.
            </span>,
            <span>
              <strong>Off</strong> -- tagging is fully disabled. The library still works normally
              for browsing, exporting, and manual collections.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Smart vs Manual Collections" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Manual collections</strong> hold an explicit list of asset ids. Drag assets
              in, remove them out -- the contents only change when you change them.
            </span>,
            <span>
              <strong>Smart collections</strong> hold a query: prompt text, model, tags, date
              range, style category, color palette, mood. The collection re-evaluates whenever the
              library changes, so it always reflects "everything that matches" right now.
            </span>,
            <span>
              Smart queries can be tuned at any time without re-creating the collection. A
              collection that started as "everything from this week tagged portrait" can become
              "everything from this month tagged portrait OR character" with one edit.
            </span>,
            <span>
              Both types support a cover asset, a description, and ordering on the Collections
              page so you can curate what each collection looks like at a glance.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Tag Categories" tone="info">
        <GuideList
          items={[
            <span>
              <strong>Style</strong> -- visual style detected from the image (photorealistic,
              anime, watercolor, etc.).
            </span>,
            <span>
              <strong>Subject</strong> -- what&apos;s in the image (portrait, landscape, product,
              object, character).
            </span>,
            <span>
              <strong>Color</strong> -- dominant colors and named palette entries; smart
              collections can target these directly.
            </span>,
            <span>
              <strong>Mood</strong> -- emotional register (calm, dramatic, energetic) inferred
              from composition and palette.
            </span>,
            <span>
              <strong>Custom</strong> -- your own tags. Custom tags coexist with AI tags and never
              get overwritten by re-analysis.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Batch Result Management" tone="info">
        <GuideList
          items={[
            <span>
              Batch results can be previewed, bulk exported, or bulk deleted after a run. The
              batch workspace keeps prompt order, status, and per-result metadata together so
              large prompt sets stay reviewable.
            </span>,
            <span>
              Failed prompts in a batch keep their position in the list with a retry control --
              they don&apos;t silently disappear, so you always know what produced what.
            </span>,
            <span>
              Batch results are also full members of the Assets library, so smart collections
              that filter by date or model surface them automatically.
            </span>,
          ]}
        />
      </GuideCallout>

      <GuideCallout title="Path Safety" tone="warning">
        <GuideList
          items={[
            <span>
              Reads only resolve inside managed output roots. Imports go through a managed copy
              so external paths never become library entries directly.
            </span>,
            <span>
              Exports only land inside Home, Desktop, Documents, Downloads, Pictures, or Videos.
              Selecting a destination outside those roots is rejected with a clear error.
            </span>,
            <span>
              Cleared cache only affects the internal output folder -- your imports and external
              roots are never touched by Clear Cache.
            </span>,
          ]}
        />
      </GuideCallout>
    </UserGuideSection>
  );
}
