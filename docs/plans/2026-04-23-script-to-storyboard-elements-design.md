# Script To Storyboard And Elements Design

## Goal

Add a project-scoped `Element` model and a staged script-to-storyboard import flow so Vision Studio can turn pasted story text into reviewable storyboard structure without breaking the current `characters`, `scenes`, or reference workflows.

This phase should make storyboarding feel more like an AI-native planning surface instead of a manual scene list.

The first milestone is intentionally narrow:

- project-scoped Elements only
- storyboard-first import flow
- no direct timeline clip creation on initial import
- compatibility with existing `CharacterRef`-based surfaces
- no destructive migration of older projects

## Chosen Approach

Use an `ImportDraft` review flow plus a new project-scoped `Element` continuity model.

The import path should parse raw script or brief text into a durable draft object that contains:

- candidate scenes
- optional shot beats
- candidate Elements
- scene-to-element links
- prompt and continuity notes

Nothing writes directly into the live `Project` until the user reviews and approves the draft.

`Element` becomes the canonical continuity object for new planning flows, while `CharacterRef` remains as a compatibility adapter for current storyboard and generation surfaces until the migration is complete.

## Alternatives Considered

### 1. AI-native scene planner with Elements as the continuity layer

- Aligns with the current project -> scene -> reference architecture.
- Keeps storyboard as the first-class planning surface.
- Lets the product differentiate from a generic editor.
- Recommended.

### 2. Elements-first model without an import draft review step

- Simpler implementation on paper.
- Risky because raw parsing would write directly into project state.
- Harder to dedupe, merge, or correct extracted candidates safely.

### 3. Loose script import that only creates scenes

- Lower scope.
- Does not solve cross-scene continuity.
- Leaves Characters, references, and future timeline derivation disconnected.

## Core Architecture

### New Element domain model

Add a new project-scoped `Element` type in the project domain.

Expected first-pass fields:

- `id`
- `projectId`
- `type: 'character' | 'object' | 'location' | 'style'`
- `name`
- `aliases: string[]`
- `description`
- `tags: string[]`
- `continuityNotes`
- `referenceSetIds: string[]`
- `heroMediaAssetId: string | null`
- `status: 'draft' | 'approved' | 'archived'`
- `color`
- `metadata`

Each project should gain:

- `elements: Element[]`

Each scene should gain:

- `elementIds: string[]`
- `shotBeats?: SceneShotBeat[]`

The initial rollout should keep `project.characters` and `scene.characterRefs`, but new import flows should write Elements first.

### ImportDraft review model

Add a separate import-review model that is not treated as part of the durable live project graph until approval.

Expected first-pass structure:

- `id`
- `projectId`
- `sourceText`
- `title`
- `sceneDrafts`
- `elementDrafts`
- `issues`
- `createdAt`
- `updatedAt`

Each `sceneDraft` should include:

- provisional name
- summary or prompt seed
- notes
- ordered shot beats
- linked element candidate ids

Each `elementDraft` should include:

- provisional type
- name
- aliases
- summary
- merge target if matched to an existing Element

### Compatibility-first data flow

Use a staged migration:

1. New import writes approved data into `elements` and `scene.elementIds`.
2. Character-oriented surfaces derive their display state from matching `Element` records when possible.
3. Older saved projects without Elements still load and behave as they do today.
4. A later milestone can reduce direct dependence on `project.characters`.

### ReferenceSets remain separate

`ReferenceSet` should remain the media attachment layer. Elements should point to reference sets instead of replacing them.

That keeps semantic continuity and media attachment as separate concerns:

- `Element` answers what the thing is
- `ReferenceSet` answers which media supports it

## Interaction Model

### Script import entry

Storyboard gets an explicit `Import Script` or `Import Outline` entry point.

The first version should support pasted text and possibly plain-text file input, then open an import review surface instead of committing immediately.

### Import review

The review step is the critical product surface for this phase.

The user should be able to:

- inspect proposed scenes
- rename scenes before commit
- edit summaries and prompt seeds
- review extracted Elements
- merge duplicate candidates into existing Elements
- drop weak or unwanted candidates
- confirm scene-to-element links

No live project mutation should happen before the user confirms.

### Storyboard Elements panel

Add a new `Elements` panel to storyboard beside or near the current character library.

It should show:

- project-scoped Elements
- type
- usage count
- linked references
- continuity notes
- quick access to scenes using that Element

### Scene cards

Scene cards should stay lightweight but gain:

- linked Element chips
- optional shot beat counts
- small import-origin or draft-derived metadata where helpful

### Timeline relationship

Timeline is a follow-on consumer, not the first write target.

The import draft should preserve beat data so the next milestone can derive timeline clips from approved storyboard structure.

## Migration Strategy

Do not hard-cut from `CharacterRef` to `Element`.

Initial migration rules:

- keep `project.characters` and `scene.characterRefs` intact
- add `project.elements` and `scene.elementIds` additively
- adapt character-focused storyboard UI to read derived character Elements where possible
- allow old projects with only `CharacterRef` to continue loading unchanged

New script imports should treat `Element` as canonical, while compatibility adapters keep the rest of the product stable during rollout.

## Scope For Milestone One

### Included

- project-scoped `Element` domain
- `ImportDraft` review model
- parser and extractor for scenes, beats, and element candidates
- storyboard import review flow
- storyboard Elements panel
- scene-linked Element chips
- compatibility adapters for current character-centric surfaces

### Excluded

- automatic timeline clip creation
- global cross-project Elements
- audio
- collaborative review state
- full NLE-style beat editing during import
- destructive migration of existing character data

## Testing Strategy

Add coverage for:

- project normalization with new `elements` and `scene.elementIds`
- import draft parsing and normalization
- element candidate dedupe and merge behavior
- approved import commit flow
- compatibility behavior with projects that only contain `CharacterRef`
- storyboard rendering of Element chips and usage counts

## Risks

Main risks:

- duplicating continuity state between `CharacterRef` and `Element`
- overcommitting parser intelligence before the review step is stable
- making storyboard UI too heavy before the underlying domain settles

Mitigations:

- keep `Element` canonical only for new import flows
- force all import writes through review and approval
- keep timeline derivation out of the first milestone

## Recommended Milestone Order

1. Add `Element` and `ImportDraft` domain/store foundations with compatibility adapters.
2. Build the parser and extractor pipeline for scenes, beats, and element candidates.
3. Add the storyboard import-review flow.
4. Add the storyboard `Elements` panel and scene-linked Element chips.
5. Wire approved imports into reference sets and current storyboard flows.
6. Add timeline derivation from approved shot beats in the next phase.
