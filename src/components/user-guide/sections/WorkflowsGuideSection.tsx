import { GuideList } from '../GuideList';
import { UserGuideSection } from '../UserGuideSection';

export function WorkflowsGuideSection() {
  return (
    <UserGuideSection
      id="guide-workflows"
      title="Workflows"
      summary="Build graph workflows and refinement pipelines for repeatable production steps."
    >
      <GuideList
        items={[
          'Use Workflows for node graph editing and ComfyUI export.',
          'Use Pipelines for reusable image refinement chains such as upscale, restore, and polish.',
          'Keep presets built in, then duplicate them when a project needs custom ordering or parameters.',
        ]}
      />
    </UserGuideSection>
  );
}
