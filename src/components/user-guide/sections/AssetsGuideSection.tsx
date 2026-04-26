import { GuideCallout } from '../GuideCallout';
import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function AssetsGuideSection() {
  return (
    <UserGuideSection
      id="guide-assets"
      title="Assets"
      summary="Review, organize, export, and recover generated media from both local and hosted runs."
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
            Export and reveal flows remain safe-user actions, so media can be moved into your normal
            Documents, Downloads, Pictures, or project destination without bypassing app safeguards.
          </span>,
        ]}
      />

      <GuideCallout title="One Library For Local And Hosted Output" tone="accent">
        <p>
          OpenRouter still-image results are written into the managed output root before they are
          synced back into Assets. Users do not need a separate hosted gallery to find BYOK output.
        </p>
      </GuideCallout>

      <GuideCallout title="Batch Result Management">
        <p>
          Batch results can be previewed, bulk exported, or bulk deleted after a run. The batch
          workspace keeps prompt order, status, and per-result metadata together so large prompt sets
          stay reviewable.
        </p>
      </GuideCallout>
    </UserGuideSection>
  );
}
