# Real Edit Tools PR2 — Guided-Pass Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the four remaining Edit-page AI tools real — Style Transfer (img2img), Generative Fill + Object Removal (inpaint with Edit-canvas masks), AI Expand (backend outpaint pre-step) — plus the returning Background Replacement (inverted-u2net-mask inpaint), as thin frontends over the shipped guided-pass machinery.

**Architecture:** Two new backend pre-steps (`guided/outpaint.py` grows the canvas and computes the border mask; background replacement computes an inverted U²-Net subject mask via the PR1 `edit_tools` stack), then the existing inpaint path runs unchanged. A renderer runner (`runGuidedEditTool`) submits ordinary `/api/generate/image` jobs through the existing IPC and lands results with the PR1 `pollEditJob` handoff. Masks are drawn on the Edit canvas with the existing `RegionMaskDrawer`, held in the store, and converted 1:1 to `GenerationMaskPayload`.

**Tech Stack:** FastAPI/pydantic + PIL/numpy (backend, stub-CI-safe), React 19 + Zustand + react-konva (renderer), Vitest + pytest.

**Spec:** `docs/superpowers/specs/2026-07-05-real-edit-tools-design.md` §5 (PR2 contract).

## Global Constraints

- User-facing error messages NEVER contain filesystem paths (`GuidedValidationError` discipline).
- `backend/guided/` modules must import and run on stub CI (no torch): `outpaint.py` is pure PIL + numpy only.
- Honesty rails: every tool does real work or refuses loudly; no fake knobs, no silent degradation. The `"Ships with the guided-pass update."` caption is deleted in this PR — all seven tools are real after it.
- Missing-weights / missing-model refusals must match `/install .* from the Foundry/i` so the panel's "Open Foundry" action appears.
- No emoji or decorative glyphs in `src/` (ui-glyphs.test.ts); use `lucide-react` icons; `.mono-label`/design-token classes per DESIGN.md.
- Pipelines need /8 dimensions within 256–2048 (`ImageGenerationRequest` bounds): renderer snaps.
- Tests: `.test.tsx` = jsdom (needs explicit `afterEach(cleanup)`), `.test.ts` = node. Backend pytest via `backend/venv/Scripts/python.exe` from `backend/`.
- Commits via the Bash tool with `export PATH="/c/Program Files/nodejs:$PATH"` first and `git branch --show-current` in the same call; never `git add -A` (LICENSE.txt stays untracked); never `--no-verify`. Branch: `feat/guided-edit-tools`.
- Pydantic-version caution: do not use `min_items`/`min_length` on the directions list — membership/emptiness validation lives in `resolve_guided_pass` (single source of truth, pre-flighted to 422).

---

### Task 1: `backend/guided/outpaint.py` — canvas expansion + border mask

**Files:**
- Create: `backend/guided/outpaint.py`
- Test: `backend/tests/test_guided_outpaint.py`

**Interfaces:**
- Consumes: nothing project-specific (PIL, numpy).
- Produces: `expand_canvas(image: PIL.Image, directions: Iterable[str], pixels: int) -> Tuple[Image (RGB), Image (L)]`, `normalize_directions(directions) -> List[str]` (raises `ValueError`), constants `DIRECTIONS`, `SEAM_OVERLAP = 16`. Task 4 (generator) calls `expand_canvas`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_guided_outpaint.py`:

```python
"""#34 PR2: AI Expand pre-step - canvas expansion + border mask (stub-CI-safe)."""
import numpy as np
import pytest
from PIL import Image

from guided.outpaint import SEAM_OVERLAP, expand_canvas, normalize_directions


def _source(width=64, height=48):
    """Deterministic non-uniform fixture so preservation checks mean something."""
    array = np.zeros((height, width, 3), dtype=np.uint8)
    array[:, :, 0] = np.tile(np.arange(width, dtype=np.uint8), (height, 1))
    array[:, :, 1] = np.tile(np.arange(height, dtype=np.uint8)[:, None], (1, width))
    return Image.fromarray(array)


def test_normalize_directions_validates_and_dedupes():
    assert normalize_directions(["right", "right", "up"]) == ["right", "up"]
    with pytest.raises(ValueError):
        normalize_directions(["diagonal"])
    with pytest.raises(ValueError):
        normalize_directions([])


def test_expand_right_grows_only_the_right_edge():
    image = _source()
    expanded, mask = expand_canvas(image, ["right"], 32)
    assert expanded.size == (96, 48)
    assert mask.size == (96, 48)
    assert expanded.mode == "RGB"
    assert mask.mode == "L"
    # Original pixels are preserved in place.
    np.testing.assert_array_equal(np.asarray(expanded)[:, :64], np.asarray(image))


def test_mask_covers_border_and_seam_band_only():
    _expanded, mask = expand_canvas(_source(), ["right"], 32)
    mask_array = np.asarray(mask)
    assert (mask_array[:, 64:] == 255).all(), "the new border must repaint"
    assert (mask_array[:, 64 - SEAM_OVERLAP:64] == 255).all(), "seam band repaints"
    assert (mask_array[:, :64 - SEAM_OVERLAP] == 0).all(), "interior is preserved"


def test_multi_direction_fills_corners_and_preserves_the_original():
    image = _source()
    expanded, mask = expand_canvas(image, ["up", "left"], 16)
    assert expanded.size == (80, 64)
    np.testing.assert_array_equal(np.asarray(expanded)[16:, 16:80], np.asarray(image))
    mask_array = np.asarray(mask)
    assert (mask_array[:16, :] == 255).all()
    assert (mask_array[:, :16] == 255).all()
    # Interior past both seam bands stays black.
    assert (mask_array[16 + SEAM_OVERLAP:, 16 + SEAM_OVERLAP:] == 0).all()


def test_pad_wider_than_source_falls_back_to_edge_repeat():
    image = _source(width=24, height=24)
    expanded, _mask = expand_canvas(image, ["left", "right"], 64)
    assert expanded.size == (24 + 128, 24)
    # Edge repeat: the outermost prefill column equals the source edge column.
    np.testing.assert_array_equal(
        np.asarray(expanded)[:, 0], np.asarray(image)[:, 0])


def test_rejects_nonpositive_pixels():
    with pytest.raises(ValueError):
        expand_canvas(_source(), ["right"], 0)
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`): `venv/Scripts/python.exe -m pytest tests/test_guided_outpaint.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'guided.outpaint'`.

- [ ] **Step 3: Write the implementation**

`backend/guided/outpaint.py`:

```python
"""#34 PR2: AI Expand pre-step - grow the canvas and build the border mask.

Pure PIL + numpy (both on stub CI). The expanded image gets a mirrored-edge
prefill so the inpaint pass sees plausible local statistics under the mask;
the mask covers the new border plus a small seam band inside the original so
the pass blends the boundary instead of leaving a hard edge.
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Tuple

import numpy as np
from PIL import Image

DIRECTIONS = ("up", "down", "left", "right")
# The mask reaches this far into the original image so the seam is repainted.
SEAM_OVERLAP = 16


def normalize_directions(directions: Iterable[str]) -> List[str]:
    """Validated, order-preserving, de-duplicated direction list."""
    seen: List[str] = []
    for direction in directions or []:
        if direction not in DIRECTIONS:
            raise ValueError(f"unknown outpaint direction '{direction}'")
        if direction not in seen:
            seen.append(direction)
    if not seen:
        raise ValueError("outpaint needs at least one direction")
    return seen


def expand_canvas(
    image: Image.Image, directions: Iterable[str], pixels: int
) -> Tuple[Image.Image, Image.Image]:
    """(expanded RGB image, L-mode border mask) for an outpaint pass.

    The border prefill mirrors edge content (numpy 'symmetric'); when the
    pad is wider than the source the unconditionally safe 'edge' repeat is
    used instead. White (255) mask = repaint: every padded border plus a
    SEAM_OVERLAP band just inside the original.
    """
    resolved = normalize_directions(directions)
    pixels = int(pixels)
    if pixels <= 0:
        raise ValueError("outpaint pixels must be positive")

    pads: Dict[str, int] = {
        side: (pixels if side in resolved else 0) for side in DIRECTIONS
    }
    array = np.asarray(image.convert("RGB"))
    height, width = array.shape[:2]
    pad_spec = ((pads["up"], pads["down"]), (pads["left"], pads["right"]), (0, 0))
    mode = "symmetric" if pixels <= min(height, width) else "edge"
    expanded = Image.fromarray(np.pad(array, pad_spec, mode=mode))

    mask = np.full(
        (height + pads["up"] + pads["down"], width + pads["left"] + pads["right"]),
        255,
        dtype=np.uint8,
    )
    # The interior (original content) stays black, minus a seam band on each
    # expanded side so the pass can blend across the boundary.
    top = pads["up"] + (SEAM_OVERLAP if pads["up"] else 0)
    bottom = pads["down"] + (SEAM_OVERLAP if pads["down"] else 0)
    left = pads["left"] + (SEAM_OVERLAP if pads["left"] else 0)
    right = pads["right"] + (SEAM_OVERLAP if pads["right"] else 0)
    interior_height = mask.shape[0] - top - bottom
    interior_width = mask.shape[1] - left - right
    if interior_height > 0 and interior_width > 0:
        mask[top:top + interior_height, left:left + interior_width] = 0
    return expanded, Image.fromarray(mask, mode="L")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `venv/Scripts/python.exe -m pytest tests/test_guided_outpaint.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/guided/outpaint.py backend/tests/test_guided_outpaint.py
git commit -m "feat(edit): outpaint pre-step - canvas expansion + border mask (#34)"
```

---

### Task 2: `resolve_guided_pass` learns outpaint

**Files:**
- Modify: `backend/guided/passes.py`
- Test: `backend/tests/test_guided_passes.py` (append; match the file's existing import style)

**Interfaces:**
- Consumes: existing `GuidedPassPlan`, `GuidedValidationError`, `_clean`.
- Produces: `resolve_guided_pass(controlnet, reference_images, inpaint, denoising_strength, outpaint=None, background_replace=None)`; `GuidedPassPlan.outpaint: Optional[Dict]` (`{"directions": [...], "pixels": int}`) and `GuidedPassPlan.background_replace: bool` (both only set when `kind == "inpaint"`); messages `MSG_OUTPAINT_PLUS_INPAINT`, `MSG_OUTPAINT_PLUS_REFERENCE`, `MSG_BG_REPLACE_CONFLICT`. Tasks 3 and 4 call the new parameters.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_guided_passes.py`)

```python
OUTPAINT = {"image_path": "base.png", "directions": ["right", "up"], "pixels": 128}


def test_outpaint_resolves_to_an_inpaint_plan_with_pre_step():
    plan = resolve_guided_pass(None, None, None, 1.0,
                               outpaint=dict(OUTPAINT, prompt="more sky"))
    assert plan.kind == "inpaint"
    assert plan.image_path == "base.png"
    assert plan.mask is None
    assert plan.outpaint == {"directions": ["right", "up"], "pixels": 128}
    assert plan.prompt_override == "more sky"
    assert plan.strength == 1.0


def test_outpaint_plus_inpaint_is_refused():
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(
            None, None,
            {"image_path": "b.png", "mask": {"type": "brush", "points": []}},
            0.8, outpaint=dict(OUTPAINT))


def test_outpaint_plus_reference_is_refused():
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(
            None, [{"layer_id": "r1", "source_path": "r.png"}], None,
            0.8, outpaint=dict(OUTPAINT))


def test_outpaint_direction_and_pixel_validation():
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(None, None, None, 1.0,
                            outpaint=dict(OUTPAINT, directions=["diagonal"]))
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(None, None, None, 1.0,
                            outpaint=dict(OUTPAINT, directions=[]))
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(None, None, None, 1.0,
                            outpaint=dict(OUTPAINT, pixels=0))


def test_no_outpaint_leaves_existing_plans_unchanged():
    plan = resolve_guided_pass(None, None, None, 0.75)
    assert plan.kind == "none"
    assert plan.outpaint is None
    assert plan.background_replace is False


def test_background_replace_resolves_to_an_inpaint_plan():
    plan = resolve_guided_pass(
        None, None, None, 1.0,
        background_replace={"image_path": "base.png"})
    assert plan.kind == "inpaint"
    assert plan.image_path == "base.png"
    assert plan.mask is None
    assert plan.background_replace is True
    assert plan.outpaint is None


def test_background_replace_conflicts_are_refused():
    bg = {"image_path": "base.png"}
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(
            None, None,
            {"image_path": "b.png", "mask": {"type": "brush", "points": []}},
            1.0, background_replace=bg)
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(
            None, [{"layer_id": "r1", "source_path": "r.png"}], None,
            1.0, background_replace=bg)
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass(
            None, None, None, 1.0, outpaint=dict(OUTPAINT),
            background_replace=bg)
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/Scripts/python.exe -m pytest tests/test_guided_passes.py -v`
Expected: the new tests FAIL with `TypeError: resolve_guided_pass() got an unexpected keyword argument 'outpaint'`.

- [ ] **Step 3: Implement in `backend/guided/passes.py`**

Add after `MSG_INPAINT_PLUS_REFERENCE`:

```python
MSG_OUTPAINT_PLUS_INPAINT = (
    "Use either an inpaint mask or AI Expand for a single generation - "
    "not both."
)
MSG_OUTPAINT_PLUS_REFERENCE = (
    "Use either AI Expand or a reference image layer for a single "
    "generation - combining them is not supported yet (#34)."
)
MSG_BG_REPLACE_CONFLICT = (
    "Use only one of background replacement, an inpaint mask, AI Expand, "
    "or reference layers for a single generation."
)
```

Add to `GuidedPassPlan` (after `ip_references`):

```python
    # #34 PR2 (edit tools): AI Expand pre-step; only set when kind=="inpaint".
    # The generator grows the canvas and computes the border mask itself.
    outpaint: Optional[Dict[str, Any]] = None
    # #34 PR2 (edit tools): background replacement - the generator computes an
    # inverted U2-Net subject mask itself; only set when kind=="inpaint".
    background_replace: bool = False
```

Change the signature and body of `resolve_guided_pass`:

```python
def resolve_guided_pass(
    controlnet: Optional[List[Dict[str, Any]]],
    reference_images: Optional[List[Dict[str, Any]]],
    inpaint: Optional[Dict[str, Any]],
    denoising_strength: float,
    outpaint: Optional[Dict[str, Any]] = None,
    background_replace: Optional[Dict[str, Any]] = None,
) -> GuidedPassPlan:
```

After the existing `if inpaint and reference_images:` refusal, add:

```python
    if outpaint and inpaint:
        raise GuidedValidationError(MSG_OUTPAINT_PLUS_INPAINT)
    if outpaint and reference_images:
        raise GuidedValidationError(MSG_OUTPAINT_PLUS_REFERENCE)
    if background_replace and (inpaint or outpaint or reference_images):
        raise GuidedValidationError(MSG_BG_REPLACE_CONFLICT)
```

After the existing `if inpaint:` block, add:

```python
    if outpaint:
        directions = list(outpaint.get("directions") or [])
        if not directions or any(
                d not in ("up", "down", "left", "right") for d in directions):
            raise GuidedValidationError(
                "AI Expand needs at least one valid direction "
                "(up, down, left or right)."
            )
        pixels = int(outpaint.get("pixels") or 0)
        if pixels <= 0:
            raise GuidedValidationError(
                "AI Expand needs a positive pixel amount."
            )
        return GuidedPassPlan(
            kind="inpaint",
            image_path=outpaint.get("image_path"),
            mask=None,
            strength=denoising_strength,
            prompt_override=_clean(outpaint.get("prompt")),
            negative_prompt_override=_clean(outpaint.get("negative_prompt")),
            notices=notices,
            controlnet=controlnet,
            outpaint={"directions": directions, "pixels": pixels},
        )

    if background_replace:
        return GuidedPassPlan(
            kind="inpaint",
            image_path=background_replace.get("image_path"),
            mask=None,
            strength=denoising_strength,
            prompt_override=_clean(background_replace.get("prompt")),
            negative_prompt_override=_clean(background_replace.get("negative_prompt")),
            notices=notices,
            controlnet=controlnet,
            background_replace=True,
        )
```

- [ ] **Step 4: Run to verify green**

Run: `venv/Scripts/python.exe -m pytest tests/test_guided_passes.py -v`
Expected: all pass (existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add backend/guided/passes.py backend/tests/test_guided_passes.py
git commit -m "feat(edit): resolve AI Expand + background replacement into inpaint plans (#34)"
```

---

### Task 3: request schema + endpoint pre-flight

**Files:**
- Modify: `backend/main.py` (`OutpaintPassPayload` near `InpaintPassPayload` ~line 477; `ImageGenerationRequest` ~line 487; `_guided_payload` ~line 510; pre-flight `resolve_guided_pass` call ~line 1203)
- Test: `backend/tests/test_guided_request.py` (append)

**Interfaces:**
- Consumes: Task 2's `resolve_guided_pass(..., outpaint=..., background_replace=...)`.
- Produces: `ImageGenerationRequest.outpaint: Optional[OutpaintPassPayload]` and `.background_replace: Optional[BackgroundReplacePayload]`; `_guided_payload()` dict gains `"outpaint"` and `"background_replace"` keys; pre-flight 422s when the `edit-u2net` weights are missing for a replacement. The renderer payload (Task 5) mirrors this schema.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_guided_request.py`)

```python
def test_image_request_accepts_outpaint():
    req = ImageGenerationRequest(prompt="x", outpaint={
        "image_path": "base.png", "directions": ["right"], "pixels": 128})
    assert req.outpaint.pixels == 128
    assert req.outpaint.directions == ["right"]


def test_outpaint_pixel_bounds_enforced():
    with pytest.raises(ValidationError):
        ImageGenerationRequest(prompt="x", outpaint={
            "image_path": "b.png", "directions": ["right"], "pixels": 32})
    with pytest.raises(ValidationError):
        ImageGenerationRequest(prompt="x", outpaint={
            "image_path": "b.png", "directions": ["right"], "pixels": 1024})


def test_guided_payload_includes_outpaint():
    req = ImageGenerationRequest(prompt="x", outpaint={
        "image_path": "b.png", "directions": ["up", "right"], "pixels": 64})
    payload = _guided_payload(req)
    assert payload is not None
    assert payload["outpaint"]["directions"] == ["up", "right"]
    assert payload["inpaint"] is None


def test_guided_defaults_include_no_outpaint():
    req = ImageGenerationRequest(prompt="x")
    assert req.outpaint is None
    assert req.background_replace is None
    assert _guided_payload(req) is None


def test_image_request_accepts_background_replace():
    req = ImageGenerationRequest(prompt="a beach at sunset", background_replace={
        "image_path": "base.png"})
    assert req.background_replace.image_path == "base.png"
    payload = _guided_payload(req)
    assert payload is not None
    assert payload["background_replace"]["image_path"] == "base.png"
    assert payload["outpaint"] is None
```

- [ ] **Step 2: Run to verify failure**

Run: `venv/Scripts/python.exe -m pytest tests/test_guided_request.py -v`
Expected: new tests FAIL (`outpaint` not a field / payload lacks the key).

- [ ] **Step 3: Implement in `backend/main.py`**

After `InpaintPassPayload`:

```python
class OutpaintPassPayload(BaseModel):
    """#34 PR2: AI Expand - the backend grows the canvas and builds the mask.

    Direction membership is validated in resolve_guided_pass (the single
    honesty seam the endpoint pre-flights to 422).
    """
    image_path: str
    directions: List[str] = Field(..., description="subset of up/down/left/right")
    pixels: int = Field(..., ge=64, le=512)
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None


class BackgroundReplacePayload(BaseModel):
    """#34 PR2: background replacement - inverted U2-Net subject mask inpaint.

    The prompt describing the new background rides the request's main prompt.
    """
    image_path: str
```

`ImageGenerationRequest` gains (after `inpaint`):

```python
    outpaint: Optional[OutpaintPassPayload] = Field(
        default=None,
        description="#34 PR2 AI Expand pre-step (canvas growth + border mask)")
    background_replace: Optional[BackgroundReplacePayload] = Field(
        default=None,
        description="#34 PR2 background replacement (inverted u2net mask inpaint)")
```

`_guided_payload` — widen the trigger and the dict:

```python
    if not (request.controlnet or request.reference_images or request.inpaint
            or request.outpaint or request.background_replace):
        return None
    return {
        "controlnet": [layer.dict() for layer in request.controlnet],
        "reference_images": [layer.dict() for layer in request.reference_images],
        "inpaint": request.inpaint.dict() if request.inpaint else None,
        "outpaint": request.outpaint.dict() if request.outpaint else None,
        "background_replace": (
            request.background_replace.dict() if request.background_replace else None),
        "denoising_strength": request.denoising_strength,
    }
```

Pre-flight call (~line 1203) becomes:

```python
            pass_plan = resolve_guided_pass(
                guided["controlnet"], guided["reference_images"],
                guided["inpaint"], guided["denoising_strength"],
                outpaint=guided["outpaint"],
                background_replace=guided["background_replace"],
            )
```

(The existing `kind != "none"` file-existence check and the FLUX→`flux-fill` availability check then cover both new passes automatically because the plan's kind is `inpaint`.)

After the FLUX→`flux-fill` availability check inside the `if pass_plan.kind == "inpaint":` block, add the u2net availability pre-flight (mirrors the flux-fill pattern):

```python
                if pass_plan.background_replace:
                    u2net = model_registry.get_record("edit-u2net") or {}
                    if not any(os.path.exists(loc)
                               for loc in u2net.get("locations") or []):
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "Background replacement uses the U2-Net weights - "
                                "install 'edit-u2net' from the Foundry first."
                            ),
                        )
```

- [ ] **Step 4: Run to verify green** — also the whole guided family:

Run: `venv/Scripts/python.exe -m pytest tests/test_guided_request.py tests/test_guided_passes.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_guided_request.py
git commit -m "feat(edit): outpaint + background-replace on ImageGenerationRequest, pre-flight 422 seam (#34)"
```

---

### Task 4: generator hook — expand, mask, honest report

**Files:**
- Modify: `backend/utils/direct_generator.py` (import ~line 47; `resolve_guided_pass` call ~line 428; guided branch ~line 552; `guided_report` ~line 630)
- Test: `backend/tests/test_direct_generator_guided.py` (append; reuse `_generator`, `_base_image`, `_run` helpers — but note `_run` passes `guided` verbatim)

**Interfaces:**
- Consumes: Task 1 `expand_canvas`, Task 2 plan fields, PR1's `edit_tools.background.remove_background` + `edit_tools.weights.require_edit_weights` (verify the exact `require_edit_weights` parameter order in `backend/edit_tools/weights.py` before writing the call).
- Produces: outpaint jobs run the existing inpaint pipeline with the computed border mask (`result["guided"]["pass"] == "outpaint"`, `result["guided"]["outpaint"] == {"directions", "pixels"}`); background-replace jobs run it with the inverted U²-Net subject mask (`result["guided"]["pass"] == "background-replace"`); missing u2net weights raise `GuidedValidationError` with the Foundry copy.

- [ ] **Step 1: Write the failing tests** (append to `backend/tests/test_direct_generator_guided.py`)

```python
def test_outpaint_runs_inpaint_with_the_computed_border_mask(tmp_path, monkeypatch):
    calls = []
    gen, _loaded, _attached, derived, _ip = _generator(tmp_path, calls, monkeypatch)
    base = _base_image(tmp_path)  # 16x16 source
    result = _run(gen, tmp_path, {
        "outpaint": {"image_path": base, "directions": ["right"], "pixels": 8},
        "denoising_strength": 1.0,
    })
    # The pass derives the plain inpaint variant.
    assert derived and derived[0]["kind"] == "inpaint"
    call = calls[0]
    # Expanded init + computed mask, both resized to the request dimensions.
    assert call["image"].size == (8, 8)
    assert call["mask_image"] is not None
    assert call["mask_image"].size == (8, 8)
    assert call["mask_image"].getextrema()[1] == 255
    assert call["strength"] == 1.0
    assert result["guided"]["pass"] == "outpaint"
    assert result["guided"]["outpaint"] == {"directions": ["right"], "pixels": 8}


def test_outpaint_on_flux_swaps_to_the_fill_model(tmp_path, monkeypatch):
    calls = []
    gen, loaded, _attached, _derived, _ip = _generator(
        tmp_path, calls, monkeypatch, family="flux")
    base = _base_image(tmp_path)
    _run(gen, tmp_path, {
        "outpaint": {"image_path": base, "directions": ["up"], "pixels": 8},
        "denoising_strength": 1.0,
    })
    assert loaded == ["flux-fill"]


def test_background_replace_runs_inpaint_with_the_inverted_subject_mask(
        tmp_path, monkeypatch):
    from PIL import Image

    calls = []
    gen, _loaded, _attached, derived, _ip = _generator(tmp_path, calls, monkeypatch)
    base = _base_image(tmp_path)

    # Fake the u2net stack: weights resolve, and the cutout keeps a 4px-wide
    # subject stripe (alpha 255) so the inverted mask is background-white.
    import edit_tools.background as bg
    import edit_tools.weights as weights

    def fake_remove_background(image, edge_refinement, model_path=None, run=None):
        cutout = image.convert("RGBA")
        alpha = Image.new("L", image.size, 0)
        alpha.paste(255, (0, 0, 4, image.size[1]))
        cutout.putalpha(alpha)
        return cutout

    monkeypatch.setattr(bg, "remove_background", fake_remove_background)
    monkeypatch.setattr(
        weights, "require_edit_weights",
        lambda record_id, resolve_record, models_dir, label: "u2net.onnx")

    result = _run(gen, tmp_path, {
        "background_replace": {"image_path": base},
        "denoising_strength": 1.0,
    })
    assert derived and derived[0]["kind"] == "inpaint"
    call = calls[0]
    assert call["mask_image"] is not None
    extrema = call["mask_image"].getextrema()
    assert extrema[0] == 0 and extrema[1] == 255, "subject kept, background repainted"
    assert result["guided"]["pass"] == "background-replace"


def test_background_replace_refuses_without_u2net_weights(tmp_path, monkeypatch):
    from guided.passes import GuidedValidationError
    import edit_tools.weights as weights

    calls = []
    gen, _loaded, _attached, _derived, _ip = _generator(tmp_path, calls, monkeypatch)
    base = _base_image(tmp_path)

    def refuse(record_id, resolve_record, models_dir, label):
        raise weights.EditModelUnavailable(
            "The background removal weights are not installed - "
            "install 'edit-u2net' from the Foundry first.")

    monkeypatch.setattr(weights, "require_edit_weights", refuse)
    with pytest.raises(GuidedValidationError, match="edit-u2net"):
        _run(gen, tmp_path, {
            "background_replace": {"image_path": base},
            "denoising_strength": 1.0,
        })
    assert calls == []
```

(If `_run`'s fixed `model_name="sd-1.5"` conflicts with the flux case, mirror how the existing flux inpaint test in this file invokes `_generate_sync` — reuse its exact calling convention. The monkeypatches target the `edit_tools` modules because the generator imports them lazily inside the branch.)

- [ ] **Step 2: Run to verify failure**

Run: `venv/Scripts/python.exe -m pytest tests/test_direct_generator_guided.py -v`
Expected: new tests FAIL (mask_image is None / KeyError `outpaint` in report).

- [ ] **Step 3: Implement in `backend/utils/direct_generator.py`**

Import (line ~47, beside the other guided imports):

```python
from guided.outpaint import expand_canvas
```

`resolve_guided_pass` call gains the kwarg:

```python
        pass_plan = resolve_guided_pass(
            (guided or {}).get("controlnet"),
            (guided or {}).get("reference_images"),
            (guided or {}).get("inpaint"),
            (guided or {}).get("denoising_strength", 0.75),
            outpaint=(guided or {}).get("outpaint"),
            background_replace=(guided or {}).get("background_replace"),
        )
```

Add a private method on `DirectGenerator` above `_generate_sync` (lazy
edit_tools imports so the monkeypatch seam and the import graph stay clean):

```python
    def _background_replace_mask(self, image):
        """#34 PR2: inverted U2-Net subject alpha = the background inpaint mask."""
        from edit_tools import background as edit_background
        from edit_tools import weights as edit_weights

        try:
            u2net_path = edit_weights.require_edit_weights(
                "edit-u2net", _resolve_record, self.models_dir,
                "background removal")
            cutout = edit_background.remove_background(
                image, 0, model_path=u2net_path)
        except edit_weights.EditModelUnavailable as exc:
            raise GuidedValidationError(str(exc))
        return ImageOps.invert(cutout.split()[-1])
```

(`ImageOps` joins the existing PIL import; adjust `require_edit_weights`'s
argument order to match `backend/edit_tools/weights.py` exactly.)

Guided branch (currently `init_image = Image.open(...)` … `mask_image = rasterize_mask(...)`) becomes:

```python
        else:
            init_image = Image.open(pass_plan.image_path).convert("RGB")
            computed_mask = None
            if pass_plan.outpaint:
                # #34 PR2 AI Expand: grow the canvas; the computed border mask
                # replaces the drawn vector mask and the pass is plain inpaint
                # from here on.
                init_image, computed_mask = expand_canvas(
                    init_image,
                    pass_plan.outpaint["directions"],
                    pass_plan.outpaint["pixels"],
                )
            elif pass_plan.background_replace:
                # #34 PR2 background replacement: the mask is the inverted
                # U2-Net subject alpha - keep the subject, repaint the rest.
                computed_mask = self._background_replace_mask(init_image)
            base_size = init_image.size
            init_image = init_image.resize((width, height), Image.Resampling.LANCZOS)
            call_kwargs["image"] = init_image
            call_kwargs["strength"] = pass_plan.strength
            if pass_plan.kind == "inpaint":
                if computed_mask is not None:
                    mask_image = computed_mask
                else:
                    mask_image = rasterize_mask(
                        pass_plan.mask or {}, base_size[0], base_size[1])
                    if mask_coverage(mask_image) == 0.0:
                        raise GuidedValidationError(
                            "The inpaint mask is empty - draw a mask region on the canvas first."
                        )
                call_kwargs["mask_image"] = mask_image.resize(
                    (width, height), Image.Resampling.LANCZOS)
                call_kwargs["width"] = width
                call_kwargs["height"] = height
```

`guided_report` construction: change `"pass": pass_plan.kind,` to

```python
                    "pass": (
                        "outpaint" if pass_plan.outpaint
                        else "background-replace" if pass_plan.background_replace
                        else pass_plan.kind
                    ),
```

and immediately after the `guided_report = {...}` literal add:

```python
                if guided_report is not None and pass_plan.outpaint:
                    guided_report["outpaint"] = dict(pass_plan.outpaint)
```

- [ ] **Step 4: Run to verify green** (skips cleanly without torp/diffusers, real run locally):

Run: `venv/Scripts/python.exe -m pytest tests/test_direct_generator_guided.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/direct_generator.py backend/tests/test_direct_generator_guided.py
git commit -m "feat(edit): outpaint + u2net background-replace pre-steps in the guided path (#34)"
```

---

### Task 5: renderer payload types + hosted-routing guards

**Files:**
- Modify: `src/types/generation.ts` (after `GenerationInpaintPayload`), `electron/ipc-handlers/hostedImageRouting.ts`, `electron/ipc-handlers/openRouterImageRouting.ts`
- Test: `electron/ipc-handlers/hostedImageRouting.test.ts`, `electron/ipc-handlers/openRouterImageRouting.test.ts` (append one case each)

**Interfaces:**
- Produces: `GenerationOutpaintPayload`, `GenerationBackgroundReplacePayload`; `ImageGenerationRequestPayload.outpaint?` and `.background_replace?`. `GenerationParams` in `src/types/electron.d.ts` aliases the payload, so IPC typing widens automatically — no preload change (no new method).

- [ ] **Step 1: Failing tests** — append to each guard test file (match their existing describe/it style):

```ts
it('routes outpaint passes back to the local backend', () => {
  expect(
    hasUnsupportedHuggingFaceImageInputs({
      outpaint: { image_path: 'x.png', directions: ['right'], pixels: 128 },
    }),
  ).toBe(true);
});

it('routes background-replace passes back to the local backend', () => {
  expect(
    hasUnsupportedHuggingFaceImageInputs({
      background_replace: { image_path: 'x.png' },
    }),
  ).toBe(true);
});
```

(and the `hasUnsupportedOpenRouterImageInputs` twins in the OpenRouter file.)

- [ ] **Step 2: Run** `npx vitest run electron/ipc-handlers/hostedImageRouting.test.ts electron/ipc-handlers/openRouterImageRouting.test.ts` — expected FAIL (returns false).

- [ ] **Step 3: Implement**

`src/types/generation.ts` after `GenerationInpaintPayload`:

```ts
/** #34 PR2: AI Expand - the backend grows the canvas and builds the border mask. */
export interface GenerationOutpaintPayload {
  image_path: string;
  directions: Array<'up' | 'down' | 'left' | 'right'>;
  pixels: number;
  prompt?: string;
  negative_prompt?: string;
}

/** #34 PR2: background replacement - inverted U2-Net subject mask inpaint. */
export interface GenerationBackgroundReplacePayload {
  image_path: string;
}
```

`ImageGenerationRequestPayload` gains (after `inpaint?`):

```ts
  /** #34 PR2: AI Expand pre-step (canvas growth + backend border mask). */
  outpaint?: GenerationOutpaintPayload;
  /** #34 PR2: background replacement (backend computes the inverted u2net mask). */
  background_replace?: GenerationBackgroundReplacePayload;
```

Both guard functions: add `outpaint?: unknown;` and `background_replace?: unknown;` to the candidate type and `|| candidate?.outpaint || candidate?.background_replace` to the return expression. Update each guard's doc comment to mention both.

- [ ] **Step 4: Run** the two test files again — expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/types/generation.ts electron/ipc-handlers/hostedImageRouting.ts electron/ipc-handlers/openRouterImageRouting.ts electron/ipc-handlers/hostedImageRouting.test.ts electron/ipc-handlers/openRouterImageRouting.test.ts
git commit -m "feat(edit): outpaint + background-replace payload types, hosted-provider guards (#34)"
```

---

### Task 6: store — Edit AI mask state

**Files:**
- Modify: `src/store/slices/editSlice.ts`, `src/store/appStore.types.ts` (Edit Mode state block ~line 399 + the edit actions block; add the `RegionMask` import if absent)
- Test: `src/store/slices/editSlice.test.ts` (create; node env `.test.ts`; if importing `@/store/appStore` needs environment stubs, mirror `src/store/appStore.test.ts`'s setup exactly)

**Interfaces:**
- Produces store fields `editAiMask: RegionMask | null`, `editAiMaskTool: 'brush' | 'rectangle'`, `editAiMaskBrushSize: number` (default 40), `editAiMaskDrawing: boolean`; actions `setEditAiMask`, `setEditAiMaskTool`, `setEditAiMaskBrushSize`, `setEditAiMaskDrawing`. `setCurrentImage` clears `editAiMask` (stale coordinates). Tasks 8–10 consume all of these.

- [ ] **Step 1: Failing tests** — `src/store/slices/editSlice.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/appStore';
import type { RegionMask } from '@/types/project';

const MASK: RegionMask = {
  type: 'brush',
  points: [
    { x: 4, y: 4 },
    { x: 20, y: 20 },
  ],
  bounds: { x: 4, y: 4, width: 16, height: 16 },
  brushSize: 32,
  featherRadius: 2,
  blendEdges: true,
};

describe('edit AI mask state (#34 PR2)', () => {
  afterEach(() => {
    useAppStore.getState().setEditAiMask(null);
    useAppStore.getState().setEditAiMaskDrawing(false);
    useAppStore.getState().setCurrentImage(null);
  });

  it('stores and clears the mask', () => {
    useAppStore.getState().setEditAiMask(MASK);
    expect(useAppStore.getState().editAiMask).toEqual(MASK);
    useAppStore.getState().setEditAiMask(null);
    expect(useAppStore.getState().editAiMask).toBeNull();
  });

  it('clears the mask when the edit image changes (stale coordinates)', () => {
    useAppStore.getState().setEditAiMask(MASK);
    useAppStore.getState().setCurrentImage('preview.png', 'C:/assets/preview.png');
    expect(useAppStore.getState().editAiMask).toBeNull();
  });

  it('tracks tool, brush size and drawing mode', () => {
    expect(useAppStore.getState().editAiMaskTool).toBe('brush');
    expect(useAppStore.getState().editAiMaskBrushSize).toBe(40);
    expect(useAppStore.getState().editAiMaskDrawing).toBe(false);
    useAppStore.getState().setEditAiMaskTool('rectangle');
    useAppStore.getState().setEditAiMaskBrushSize(80);
    useAppStore.getState().setEditAiMaskDrawing(true);
    expect(useAppStore.getState().editAiMaskTool).toBe('rectangle');
    expect(useAppStore.getState().editAiMaskBrushSize).toBe(80);
    expect(useAppStore.getState().editAiMaskDrawing).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/store/slices/editSlice.test.ts` — expected FAIL (missing fields/actions and a typecheck error).

- [ ] **Step 3: Implement**

`editSlice.ts` — import `import type { RegionMask } from '@/types/project';`; `editInitialState` gains:

```ts
  // #34 PR2: shared inpaint mask for the AI tools (Generative Fill / Object
  // Removal). One mask at a time, in intrinsic image pixels; cleared whenever
  // the edit image changes because its coordinates belong to the old image.
  editAiMask: null as RegionMask | null,
  editAiMaskTool: 'brush' as 'brush' | 'rectangle',
  editAiMaskBrushSize: 40,
  editAiMaskDrawing: false,
```

Actions (inside `createEditActions`'s returned object):

```ts
    setEditAiMask: (mask: RegionMask | null) => set({ editAiMask: mask }),
    setEditAiMaskTool: (tool: AppState['editAiMaskTool']) => set({ editAiMaskTool: tool }),
    setEditAiMaskBrushSize: (size: number) => set({ editAiMaskBrushSize: size }),
    setEditAiMaskDrawing: (drawing: boolean) => set({ editAiMaskDrawing: drawing }),
```

`setCurrentImage`'s `set({...})` object gains `editAiMask: null,`.

`appStore.types.ts` — Edit Mode state block gains:

```ts
  editAiMask: RegionMask | null;
  editAiMaskTool: 'brush' | 'rectangle';
  editAiMaskBrushSize: number;
  editAiMaskDrawing: boolean;
```

and the edit actions block gains:

```ts
  setEditAiMask: (mask: RegionMask | null) => void;
  setEditAiMaskTool: (tool: 'brush' | 'rectangle') => void;
  setEditAiMaskBrushSize: (size: number) => void;
  setEditAiMaskDrawing: (drawing: boolean) => void;
```

- [ ] **Step 4: Run** `npx vitest run src/store/slices/editSlice.test.ts` and `npm run typecheck` — expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/store/slices/editSlice.ts src/store/appStore.types.ts src/store/slices/editSlice.test.ts
git commit -m "feat(edit): AI-tool mask state in the edit slice (#34)"
```

---

### Task 7: extract the shared poll loop (`editJobPolling.ts`)

**Files:**
- Create: `src/features/edit/editJobPolling.ts`
- Modify: `src/features/edit/runEditTool.ts` (shrink to submit + notice derivation)
- Test: existing `src/features/edit/runEditTool.test.ts` must stay green UNCHANGED (behavior-preserving refactor)

**Interfaces:**
- Produces: `pollEditJob(options) -> Promise<EditJobPollResult>` with `EditJobPollResult = { ok, jobId, error?, result? }`; re-exported `EDIT_POLL_LOST_MESSAGE`; type `EditStore`. Task 8 consumes `pollEditJob`.

- [ ] **Step 1: Create `src/features/edit/editJobPolling.ts`**

```ts
import type { StoreApi, UseBoundStore } from 'zustand';

import type { AppState } from '@/store/appStore.types';
import { toPreviewUrl, resolveStoredAssetPath } from '@/features/assets/assetRecords';
import {
  makePollErrorBudget,
  recordPollError,
  recordPollSuccess,
} from '@/features/generation/pollErrorBudget';
import { delay } from '@/features/workflow/runWorkflowExecution';
import type { JobStatus } from '@/types/electron';

export type EditStore = UseBoundStore<StoreApi<AppState>>;

const POLL_ERROR_CAP = 5;

export const EDIT_POLL_LOST_MESSAGE =
  'Lost connection to the AI backend while processing. Please retry.';

export interface EditJobPollApi {
  getStatus: (jobId: string) => Promise<JobStatus>;
  cancel: (jobId: string) => Promise<{ success: boolean; error?: string }>;
}

export interface PollEditJobOptions {
  electron: EditJobPollApi;
  store: EditStore;
  jobId: string;
  outputRoot: string;
  fallbackErrorMessage: string;
  pollIntervalMs: number;
  pollRetryMs: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface EditJobPollResult {
  ok: boolean;
  jobId: string;
  error?: string;
  result?: JobStatus['result'];
}

/**
 * Shared poll-and-land loop for Edit-page jobs (#34): budgeted status
 * polling, job bookkeeping, and the Studio-style landing (asset sync +
 * setCurrentImage) on completion. Failures surface the backend's message
 * verbatim; cancels are silent.
 */
export async function pollEditJob({
  electron,
  store,
  jobId,
  outputRoot,
  fallbackErrorMessage,
  pollIntervalMs,
  pollRetryMs,
  signal,
  onProgress,
}: PollEditJobOptions): Promise<EditJobPollResult> {
  let budget = makePollErrorBudget(POLL_ERROR_CAP);
  for (;;) {
    if (signal?.aborted) {
      await electron.cancel(jobId).catch(() => undefined);
      store.getState().updateJob(jobId, { status: 'cancelled', completedAt: new Date() });
      return { ok: false, jobId };
    }

    let status: JobStatus;
    try {
      status = await electron.getStatus(jobId);
      if (typeof status?.status !== 'string') {
        throw new Error('Job status unavailable');
      }
      budget = recordPollSuccess(budget);
    } catch {
      const outcome = recordPollError(budget);
      budget = outcome.budget;
      if (outcome.exhausted) {
        store.getState().updateJob(jobId, {
          status: 'failed',
          error: EDIT_POLL_LOST_MESSAGE,
          completedAt: new Date(),
        });
        return { ok: false, jobId, error: EDIT_POLL_LOST_MESSAGE };
      }
      await delay(pollRetryMs, signal).catch(() => undefined);
      continue;
    }

    if (status.status === 'completed') {
      const existingJob = store.getState().activeJobs.find((job) => job.id === jobId);
      store.getState().updateJob(jobId, {
        status: 'completed',
        progress: status.progress ?? 100,
        result: status.result,
        completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
      });
      store.getState().syncAssetsFromJobStatus({
        ...status,
        params: { ...(existingJob?.params ?? {}), output_root: outputRoot },
      });
      const outputPath = status.result?.images?.[0];
      if (outputPath) {
        const asset = store
          .getState()
          .assetLibrary.find((entry) => entry.id === `${jobId}::${outputPath}`);
        store.getState().setCurrentImage(
          asset?.previewUrl ?? toPreviewUrl(outputPath),
          asset?.path ?? resolveStoredAssetPath(outputPath, { output_root: outputRoot }),
        );
      }
      return { ok: true, jobId, result: status.result };
    }

    if (status.status === 'failed' || status.status === 'cancelled') {
      store.getState().updateJob(jobId, {
        status: status.status,
        progress: status.progress ?? 0,
        error: status.error,
        completedAt: status.completed_at ? new Date(status.completed_at) : new Date(),
      });
      if (status.status === 'failed') {
        return { ok: false, jobId, error: status.error || fallbackErrorMessage };
      }
      return { ok: false, jobId };
    }

    store.getState().updateJob(jobId, {
      status: status.status === 'pending' ? 'pending' : 'processing',
      progress: status.progress ?? 0,
    });
    onProgress?.(status.progress ?? 0);
    await delay(pollIntervalMs, signal).catch(() => undefined);
  }
}
```

- [ ] **Step 2: Shrink `runEditTool.ts`**

Delete the loop body and the local `EDIT_POLL_LOST_MESSAGE` const; keep the public exports identical:

```ts
import { pollEditJob, EDIT_POLL_LOST_MESSAGE } from './editJobPolling';

export { EDIT_POLL_LOST_MESSAGE };
```

After the existing `addJob` call, the function ends with:

```ts
  const polled = await pollEditJob({
    electron: electron.generation,
    store,
    jobId,
    outputRoot,
    fallbackErrorMessage: 'Edit operation failed',
    pollIntervalMs,
    pollRetryMs,
    signal,
    onProgress,
  });
  if (!polled.ok) {
    return polled.error ? { ok: false, jobId, error: polled.error } : { ok: false, jobId };
  }
  const facesDetected = polled.result?.faces_detected;
  const notice =
    operation === 'restore-faces' && facesDetected === 0 ? NO_FACES_NOTICE : undefined;
  return { ok: true, jobId, notice };
```

Remove now-unused imports from `runEditTool.ts` (poll budget, delay stays only if still used by the submit path — `resolveOutputRoot` remains; `toPreviewUrl`/`resolveStoredAssetPath`/`JobStatus` move out with the loop). Keep `EditStore` usage consistent (import the type from `editJobPolling`).

- [ ] **Step 3: Verify the refactor is behavior-preserving**

Run: `npx vitest run src/features/edit/runEditTool.test.ts`
Expected: all 8 existing tests pass without modification.

- [ ] **Step 4: Commit**

```bash
git add src/features/edit/editJobPolling.ts src/features/edit/runEditTool.ts
git commit -m "refactor(edit): extract the shared edit-job poll loop (#34)"
```

---

### Task 8: `runGuidedEditTool` + request builder + `useEditTool.runGuided`

**Files:**
- Create: `src/features/edit/runGuidedEditTool.ts`
- Modify: `src/features/edit/useEditTool.ts`
- Test: `src/features/edit/runGuidedEditTool.test.ts` (create; node env; mirror `runEditTool.test.ts`'s store/electron harness exactly — same fake-electron shape, same store seeding via real actions)

**Interfaces:**
- Consumes: Task 5 payload types, Task 6 store fields, Task 7 `pollEditJob`, `selectModelsByCapability`, `toAccelerationRequestPayload`, `resolveOutputRoot`, `EDIT_BACKEND_DOWN_MESSAGE` + `EditToolResult` from `runEditTool`.
- Produces (Task 10 consumes): `GuidedEditOperation = 'style-transfer' | 'generative-fill' | 'object-removal' | 'ai-expand' | 'background-replace'`; `GuidedEditInput`; `runGuidedEditTool(operation, input, options?) -> Promise<EditToolResult>`; `buildGuidedEditRequest(operation, input, context)` (pure); `snapDimension`, `toGenerationMask`; messages `NO_IMAGE_MODEL_MESSAGE`, `EMPTY_MASK_MESSAGE`, `SOURCE_UNREADABLE_MESSAGE`; constants `OBJECT_REMOVAL_PROMPT`, `OBJECT_REMOVAL_NEGATIVE`, `AI_EXPAND_DEFAULT_PROMPT`, `STYLE_STRENGTH_MIN/MAX`. Hook: `useEditTool()` additionally returns `runGuided`; `runningOperation` widens to `EditOperation | GuidedEditOperation | null`.

- [ ] **Step 1: Write the failing tests** — `src/features/edit/runGuidedEditTool.test.ts`. Cover at minimum (full harness copied from `runEditTool.test.ts`):

```ts
// Builder (pure - no store needed):
// 1. snapDimension: 511 -> 512, 100 -> 256 (floor clamp), 4000 -> 2048 (ceil clamp).
// 2. style-transfer: strength 0 -> denoising_strength 0.3; 100 -> 0.9; prompt is
//    "userText, modifier" joined; reference_images[0] = { layer_id: 'edit-style-transfer',
//    source_path, mask: empty rectangle }; width/height = snapped source dims.
// 3. generative-fill: inpaint payload carries the converted mask
//    (brushSize -> brush_size), prompt = input prompt, denoising_strength 1.
// 4. object-removal: prompt/negative are OBJECT_REMOVAL_PROMPT/_NEGATIVE constants.
// 5. ai-expand: outpaint {image_path, directions, pixels}; width grows by
//    pixels per horizontal direction then snaps (512 source + 128 right -> 640);
//    empty prompt falls back to AI_EXPAND_DEFAULT_PROMPT; pixels clamped to 64..512.
// 5b. background-replace: background_replace {image_path}; prompt = input
//    prompt; denoising_strength 1; dims = snapped source dims.
//
// Runner (store + fake electron):
// 6. backend down -> { ok: false, error: EDIT_BACKEND_DOWN_MESSAGE }, no submit.
// 7. selected model missing or not status 'ready' -> NO_IMAGE_MODEL_MESSAGE
//    (matches /install .* from the Foundry/i), no submit.
// 8. generative-fill with a null/empty-points mask -> EMPTY_MASK_MESSAGE, no submit.
// 9. happy path: submits via generation.generateImage with the built request
//    (+ acceleration_settings), addJob type 'image' with params.source 'edit-tool',
//    poll completes -> setCurrentImage called, job lands in completedJobs,
//    returns { ok: true }.
// 10. failed job -> error surfaced verbatim from status.error.
```

Store seeding notes for the runner tests: set `systemInfo.backendConnected = true` the same way `runEditTool.test.ts` does; seed `availableModels` with one ready checkpoint record (copy the `makeModelRecord`-style literal from `src/store/slices/modelsSlice.test.ts`, `artifact_type: 'checkpoint'`, `capability: 'image'`, `status: 'ready'`, `id: 'sd-1-5'`) and `setSelectedImageModelId('sd-1-5')`; inject `measureImage: async () => ({ width: 512, height: 512 })`.

- [ ] **Step 2: Run** `npx vitest run src/features/edit/runGuidedEditTool.test.ts` — expected FAIL (module missing).

- [ ] **Step 3: Implement `src/features/edit/runGuidedEditTool.ts`**

```ts
import { useAppStore } from '@/store/appStore';
import { selectModelsByCapability } from '@/store/slices/modelsSlice';
import { toAccelerationRequestPayload } from '@/features/generation/accelerationRequest';
import { resolveOutputRoot } from '@/features/workflow/runWorkflowExecution';
import type {
  GenerationMaskPayload,
  GenerationOutpaintPayload,
  ImageGenerationRequestPayload,
} from '@/types/generation';
import type { RegionMask } from '@/types/project';

import { pollEditJob, type EditJobPollApi, type EditStore } from './editJobPolling';
import { EDIT_BACKEND_DOWN_MESSAGE, type EditToolResult } from './runEditTool';

export type GuidedEditOperation =
  | 'style-transfer'
  | 'generative-fill'
  | 'object-removal'
  | 'ai-expand'
  | 'background-replace';

export const NO_IMAGE_MODEL_MESSAGE =
  "The selected image model isn't installed - install one from the Foundry first.";
export const EMPTY_MASK_MESSAGE = 'Draw a mask over the area on the canvas first.';
export const SOURCE_UNREADABLE_MESSAGE =
  'The source image could not be read - reload it and try again.';

export const STYLE_STRENGTH_MIN = 0.3;
export const STYLE_STRENGTH_MAX = 0.9;
export const OBJECT_REMOVAL_PROMPT =
  'seamless empty background, natural continuation of the surrounding scene';
export const OBJECT_REMOVAL_NEGATIVE =
  'object, person, animal, text, watermark, logo';
export const AI_EXPAND_DEFAULT_PROMPT = 'seamless continuation of the scene';

const POLL_INTERVAL_MS = 500;
const POLL_RETRY_MS = 2000;
const MIN_DIMENSION = 256;
const MAX_DIMENSION = 2048;
const MIN_EXPAND_PIXELS = 64;
const MAX_EXPAND_PIXELS = 512;

export interface GuidedEditInput {
  source_path: string;
  /** style-transfer preset modifier text. */
  styleModifier?: string;
  /** style-transfer strength 0-100 (maps onto denoising 0.30-0.90). */
  styleStrength?: number;
  /** User text: style subject / fill content / expand description / new background. */
  prompt?: string;
  /** generative-fill / object-removal canvas mask. */
  mask?: RegionMask | null;
  /** ai-expand. */
  directions?: GenerationOutpaintPayload['directions'];
  pixels?: number;
}

export interface GuidedRequestContext {
  model: string;
  steps: number;
  cfgScale: number;
  scheduler: string;
  sourceWidth: number;
  sourceHeight: number;
}

/** Pipelines require /8 dimensions; keep the output within engine bounds. */
export function snapDimension(value: number): number {
  const snapped = Math.round(value / 8) * 8;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, snapped));
}

/** Store RegionMask -> backend mask payload (the Canvas control-layer conversion). */
export function toGenerationMask(mask: RegionMask): GenerationMaskPayload {
  return {
    type: mask.type,
    points: mask.points.map((point) => ({ ...point })),
    bounds: { ...mask.bounds },
    ...(mask.brushSize !== undefined ? { brush_size: mask.brushSize } : {}),
  };
}

// A single reference layer runs full-image img2img; its mask field is
// required by the schema but honestly unused (the backend says so).
const EMPTY_LAYER_MASK: GenerationMaskPayload = {
  type: 'rectangle',
  points: [],
  bounds: { x: 0, y: 0, width: 0, height: 0 },
};

export function buildGuidedEditRequest(
  operation: GuidedEditOperation,
  input: GuidedEditInput,
  context: GuidedRequestContext,
): ImageGenerationRequestPayload {
  const base: ImageGenerationRequestPayload = {
    prompt: '',
    negative_prompt: '',
    width: snapDimension(context.sourceWidth),
    height: snapDimension(context.sourceHeight),
    steps: context.steps,
    cfg_scale: context.cfgScale,
    model: context.model,
    scheduler: context.scheduler,
  };

  if (operation === 'style-transfer') {
    const strength = Math.max(0, Math.min(100, input.styleStrength ?? 75));
    const denoising =
      STYLE_STRENGTH_MIN + (strength / 100) * (STYLE_STRENGTH_MAX - STYLE_STRENGTH_MIN);
    return {
      ...base,
      prompt: [input.prompt?.trim(), input.styleModifier?.trim()]
        .filter(Boolean)
        .join(', '),
      reference_images: [
        {
          layer_id: 'edit-style-transfer',
          layer_name: 'Style Transfer',
          source_path: input.source_path,
          mask: { ...EMPTY_LAYER_MASK },
        },
      ],
      denoising_strength: Number(denoising.toFixed(3)),
    };
  }

  if (operation === 'generative-fill' || operation === 'object-removal') {
    const isFill = operation === 'generative-fill';
    return {
      ...base,
      prompt: isFill ? (input.prompt ?? '').trim() : OBJECT_REMOVAL_PROMPT,
      negative_prompt: isFill ? '' : OBJECT_REMOVAL_NEGATIVE,
      inpaint: {
        layer_id: isFill ? 'edit-generative-fill' : 'edit-object-removal',
        layer_name: isFill ? 'Generative Fill' : 'Object Removal',
        image_path: input.source_path,
        mask: toGenerationMask(input.mask as RegionMask),
      },
      denoising_strength: 1,
    };
  }

  if (operation === 'background-replace') {
    return {
      ...base,
      prompt: (input.prompt ?? '').trim(),
      background_replace: { image_path: input.source_path },
      denoising_strength: 1,
    };
  }

  const directions = input.directions ?? [];
  const pixels = Math.max(
    MIN_EXPAND_PIXELS,
    Math.min(MAX_EXPAND_PIXELS, Math.round(input.pixels ?? 256)),
  );
  const horizontal =
    Number(directions.includes('left')) + Number(directions.includes('right'));
  const vertical =
    Number(directions.includes('up')) + Number(directions.includes('down'));
  return {
    ...base,
    prompt: (input.prompt ?? '').trim() || AI_EXPAND_DEFAULT_PROMPT,
    width: snapDimension(context.sourceWidth + pixels * horizontal),
    height: snapDimension(context.sourceHeight + pixels * vertical),
    outpaint: {
      image_path: input.source_path,
      directions,
      pixels,
    },
    denoising_strength: 1,
  };
}

interface GuidedEditElectronApi {
  app: { getPath: (name: 'userData') => Promise<string> };
  settings: { get: () => Promise<{ defaultOutputPath: string }> };
  generation: EditJobPollApi & {
    generateImage: (
      params: ImageGenerationRequestPayload,
    ) => Promise<{ success: boolean; jobId?: string; error?: string }>;
  };
}

export interface RunGuidedEditToolOptions {
  electron?: GuidedEditElectronApi;
  store?: EditStore;
  pollIntervalMs?: number;
  pollRetryMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
  measureImage?: (src: string) => Promise<{ width: number; height: number }>;
}

function defaultMeasureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(SOURCE_UNREADABLE_MESSAGE));
    image.src = src;
  });
}

/**
 * Guided edit-tool run (#34 PR2): builds a real guided-pass generation
 * request from the panel's inputs, submits it through the ordinary image
 * IPC, and lands the finished frame with the shared Edit-page handoff.
 * Refusals are honest and instant: no backend, no ready checkpoint, or a
 * missing mask never submit a job.
 */
export async function runGuidedEditTool(
  operation: GuidedEditOperation,
  input: GuidedEditInput,
  {
    electron = window.electron as unknown as GuidedEditElectronApi,
    store = useAppStore,
    pollIntervalMs = POLL_INTERVAL_MS,
    pollRetryMs = POLL_RETRY_MS,
    signal,
    onProgress,
    measureImage = defaultMeasureImage,
  }: RunGuidedEditToolOptions = {},
): Promise<EditToolResult> {
  const state = store.getState();
  if (!state.systemInfo.backendConnected) {
    return { ok: false, error: EDIT_BACKEND_DOWN_MESSAGE };
  }

  const checkpoints = selectModelsByCapability(state.availableModels, 'image');
  const record = checkpoints.find((model) => model.id === state.selectedImageModelId);
  if (!record || record.status !== 'ready') {
    return { ok: false, error: NO_IMAGE_MODEL_MESSAGE };
  }

  if (
    (operation === 'generative-fill' || operation === 'object-removal') &&
    !(input.mask && input.mask.points.length > 0)
  ) {
    return { ok: false, error: EMPTY_MASK_MESSAGE };
  }

  let jobId: string;
  let outputRoot: string;
  let request: ImageGenerationRequestPayload;
  try {
    const previewSrc = state.currentImage;
    if (!previewSrc) {
      throw new Error(SOURCE_UNREADABLE_MESSAGE);
    }
    const dimensions = await measureImage(previewSrc);
    request = {
      ...buildGuidedEditRequest(operation, input, {
        model: state.selectedImageModelId,
        steps: state.advancedGeneration.steps,
        cfgScale: state.advancedGeneration.cfgScale,
        scheduler: state.advancedGeneration.scheduler,
        sourceWidth: dimensions.width,
        sourceHeight: dimensions.height,
      }),
      acceleration_settings: toAccelerationRequestPayload(state.accelerationSettings),
    };

    const appSettings = await electron.settings.get();
    const userDataPath = await electron.app.getPath('userData');
    outputRoot = resolveOutputRoot(appSettings.defaultOutputPath, userDataPath);

    const submitted = await electron.generation.generateImage(request);
    if (!submitted.success || !submitted.jobId) {
      throw new Error(submitted.error || 'Edit generation failed');
    }
    jobId = submitted.jobId;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Edit generation failed';
    return { ok: false, error: message };
  }

  store.getState().addJob({
    id: jobId,
    type: 'image',
    status: 'pending',
    progress: 0,
    params: { ...request, operation, output_root: outputRoot, source: 'edit-tool' },
    createdAt: new Date(),
  });

  const polled = await pollEditJob({
    electron: electron.generation,
    store,
    jobId,
    outputRoot,
    fallbackErrorMessage: 'Edit generation failed',
    pollIntervalMs,
    pollRetryMs,
    signal,
    onProgress,
  });
  if (!polled.ok) {
    return polled.error ? { ok: false, jobId, error: polled.error } : { ok: false, jobId };
  }
  return { ok: true, jobId };
}
```

(Note: the consumed mask clears automatically — `pollEditJob`'s `setCurrentImage` now clears `editAiMask` per Task 6.)

- [ ] **Step 4: Extend `useEditTool.ts`** — DRY the lifecycle into one tracker used by both entries:

```ts
import { useCallback, useRef, useState } from 'react';

import {
  runEditTool,
  type EditOperation,
  type EditToolParams,
  type EditToolResult,
} from './runEditTool';
import {
  runGuidedEditTool,
  type GuidedEditInput,
  type GuidedEditOperation,
} from './runGuidedEditTool';

export type AnyEditOperation = EditOperation | GuidedEditOperation;

/**
 * Panel-facing lifecycle for one edit-tool run at a time (#34): progress,
 * honest error/notice feedback, and cancel via AbortSignal. Re-entrant run()
 * calls while a job is in flight are no-ops. PR2 adds runGuided() for the
 * guided-pass tools; both entries share the same single-flight state.
 */
export function useEditTool() {
  const [isRunning, setIsRunning] = useState(false);
  const [runningOperation, setRunningOperation] = useState<AnyEditOperation | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const track = useCallback(
    async (
      operation: AnyEditOperation,
      invoke: (signal: AbortSignal) => Promise<EditToolResult>,
    ): Promise<EditToolResult> => {
      if (abortRef.current) {
        return { ok: false };
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setIsRunning(true);
      setRunningOperation(operation);
      setProgress(0);
      setError(null);
      setNotice(null);
      try {
        const result = await invoke(controller.signal);
        if (!result.ok && result.error) {
          setError(result.error);
        }
        if (result.notice) {
          setNotice(result.notice);
        }
        return result;
      } finally {
        abortRef.current = null;
        setIsRunning(false);
        setRunningOperation(null);
      }
    },
    [],
  );

  const run = useCallback(
    (operation: EditOperation, params: EditToolParams) =>
      track(operation, (signal) =>
        runEditTool(operation, params, { signal, onProgress: setProgress }),
      ),
    [track],
  );

  const runGuided = useCallback(
    (operation: GuidedEditOperation, input: GuidedEditInput) =>
      track(operation, (signal) =>
        runGuidedEditTool(operation, input, { signal, onProgress: setProgress }),
      ),
    [track],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearFeedback = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return {
    run,
    runGuided,
    cancel,
    isRunning,
    runningOperation,
    progress,
    error,
    notice,
    clearFeedback,
  };
}
```

- [ ] **Step 5: Run to verify green**

Run: `npx vitest run src/features/edit/runGuidedEditTool.test.ts src/features/edit/runEditTool.test.ts src/components/edit/AIToolsPanel.test.tsx` and `npm run typecheck`
Expected: all pass (the panel still compiles — `useEditTool`'s existing return members are unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/features/edit/runGuidedEditTool.ts src/features/edit/runGuidedEditTool.test.ts src/features/edit/useEditTool.ts
git commit -m "feat(edit): guided edit-tool runner - builder, honest refusals, shared handoff (#34)"
```

---

### Task 9: EditCanvas — AI mask drawing surface

**Files:**
- Modify: `src/components/edit/EditCanvas.tsx`
- Test: `src/components/edit/EditCanvas.test.tsx` (append; reuse the file's existing konva/jsdom harness and image-loading approach — if it stubs `window.Image`, reuse that stub; otherwise add one that fires `onload` with `width`/`height` set)

**Interfaces:**
- Consumes: Task 6 store fields; existing `RegionMaskDrawer`.
- Produces: a `data-testid="edit-ai-mask-surface"` overlay positioned exactly over the displayed image (left/top = `stagePos`, size = intrinsic × `stageScale`) that renders only while `editAiMaskDrawing && loadedImage`; commits write `setEditAiMask` with `featherRadius: 2, blendEdges: true` appended.

- [ ] **Step 1: Failing tests** (append to `EditCanvas.test.tsx`):

```tsx
// 1. With editAiMaskDrawing=false: queryByTestId('edit-ai-mask-surface') is null.
// 2. Seed a loaded image (per the file's harness), setEditAiMaskDrawing(true):
//    the surface renders and contains the region-mask-drawer testid.
// 3. Fire the drawer's commit path (pointer down/move/up over the surface, as
//    RegionMaskDrawer.test.tsx does): store editAiMask is set with
//    featherRadius 2 and blendEdges true.
```

- [ ] **Step 2: Run** `npx vitest run src/components/edit/EditCanvas.test.tsx` — expected FAIL.

- [ ] **Step 3: Implement in `EditCanvas.tsx`**

Imports:

```tsx
import { RegionMaskDrawer } from '@/components/edit/RegionMaskDrawer';
import type { RegionMask } from '@/types/project';
```

Module-level constant:

```tsx
const EMPTY_AI_MASK: RegionMask = {
  type: 'brush',
  points: [],
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  featherRadius: 2,
  blendEdges: true,
};
```

Store selection adds `editAiMask`, `editAiMaskTool`, `editAiMaskBrushSize`, `editAiMaskDrawing`, `setEditAiMask` to the existing `useShallow` block.

After the `<div style={{ filter: ... }}>…</Stage>…</div>` block (still inside the container), add:

```tsx
      {/* #34 PR2: AI-tool inpaint mask surface (Generative Fill / Object
          Removal). Overlays the displayed image exactly; while a mask tool is
          open in the AI panel this surface owns the pointer. */}
      {editAiMaskDrawing && loadedImage && (
        <div
          data-testid="edit-ai-mask-surface"
          className="absolute"
          style={{
            left: stagePos.x,
            top: stagePos.y,
            width: loadedImage.width * stageScale,
            height: loadedImage.height * stageScale,
          }}
        >
          <RegionMaskDrawer
            activeRegion={{ id: 'edit-ai-mask', mask: editAiMask ?? EMPTY_AI_MASK }}
            canvasWidth={loadedImage.width}
            canvasHeight={loadedImage.height}
            tool={editAiMaskTool}
            brushSize={editAiMaskBrushSize}
            onMaskCommit={(update) =>
              setEditAiMask({ ...update, featherRadius: 2, blendEdges: true })
            }
          />
        </div>
      )}
```

- [ ] **Step 4: Run** `npx vitest run src/components/edit/EditCanvas.test.tsx` — expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/edit/EditCanvas.tsx src/components/edit/EditCanvas.test.tsx
git commit -m "feat(edit): AI mask drawing surface on the edit canvas (#34)"
```

---

### Task 10: AIToolsPanel — wire the four guided tools

**Files:**
- Modify: `src/components/edit/AIToolsPanel.tsx`
- Test: `src/components/edit/AIToolsPanel.test.tsx` (extend; keep the file's existing mocking approach and `afterEach(cleanup)`)

**Interfaces:**
- Consumes: `useEditTool().runGuided`, Task 6 store fields/actions, Task 8 operation types.
- Produces: all seven tools dispatch real work; `GUIDED_TOOL_CAPTION` and every `disabled`-with-caption Apply are gone.

- [ ] **Step 1: Failing tests** — update/extend `AIToolsPanel.test.tsx`:

```tsx
// Update: the tests asserting the guided tools' Apply is disabled with
// 'Ships with the guided-pass update.' now assert the caption text appears
// NOWHERE in the rendered panel (string scan), and each tool dispatches.
//
// New cases (follow the file's dispatch-assertion pattern for the PR1 tools):
// 1. Style Transfer: select the 'Monet' preset, set strength, type an optional
//    subject, Apply -> runGuided('style-transfer', { source_path, styleModifier:
//    <monet modifier>, styleStrength, prompt }).
// 2. Generative Fill: with editAiMask seeded in the store and a prompt typed,
//    Apply -> runGuided('generative-fill', { source_path, prompt, mask }).
//    Without a mask OR with an empty prompt: Apply disabled.
// 3. Object Removal: with a mask, Apply -> runGuided('object-removal',
//    { source_path, mask }); without a mask: disabled + the draw-mask caption.
// 4. AI Expand: directions toggled + pixels + prompt, Apply -> runGuided(
//    'ai-expand', { source_path, prompt, directions, pixels }); zero
//    directions -> disabled.
// 5. Expanding the gen-fill card sets editAiMaskDrawing true in the store;
//    collapsing (or switching to a non-mask tool) sets it false.
// 6. Mask controls: brush/rectangle toggle writes editAiMaskTool; Clear Mask
//    calls setEditAiMask(null); brush-size slider writes editAiMaskBrushSize.
// 7. Background Replacement (bg-removal card): type a background description,
//    click Replace Background -> runGuided('background-replace',
//    { source_path, prompt }); empty description -> the replace button is
//    disabled while Remove Background stays enabled.
```

- [ ] **Step 2: Run** `npx vitest run src/components/edit/AIToolsPanel.test.tsx` — expected FAIL.

- [ ] **Step 3: Implement in `AIToolsPanel.tsx`**

Key edits (full fidelity — every listed change ships):

1. `STYLE_PRESETS` entries gain a `modifier` string:

```tsx
const STYLE_PRESETS = [
  { id: 'van-gogh', name: 'Van Gogh', color: 'var(--color-feature-04)', modifier: 'in the style of Vincent van Gogh, swirling impasto brushstrokes, post-impressionist oil painting' },
  { id: 'monet', name: 'Monet', color: 'var(--color-feature-08)', modifier: 'in the style of Claude Monet, impressionist oil painting, soft dappled light, plein air' },
  { id: 'ukiyo-e', name: 'Ukiyo-e', color: 'var(--color-feature-01)', modifier: 'ukiyo-e woodblock print, flat colors, bold outlines, Edo period Japanese art' },
  { id: 'comic', name: 'Comic', color: 'var(--color-feature-07)', modifier: 'comic book art, bold ink lines, halftone dots, dynamic composition' },
  { id: 'watercolor', name: 'Watercolor', color: 'var(--color-feature-02)', modifier: 'watercolor painting, soft washes, flowing pigment, paper texture' },
  { id: 'pencil', name: 'Pencil Sketch', color: '#636e72', modifier: 'pencil sketch, graphite drawing, cross-hatching, detailed shading' },
];
```

2. Delete `GUIDED_TOOL_CAPTION`. Add beside `OPERATION_BY_TOOL`:

```tsx
import type { GuidedEditOperation } from '@/features/edit/runGuidedEditTool';

// The four guided-pass tools (#34 PR2) - real img2img/inpaint/outpaint jobs
// through the user's selected checkpoint.
const GUIDED_OPERATION_BY_TOOL: Record<string, GuidedEditOperation> = {
  'style-transfer': 'style-transfer',
  'gen-fill': 'generative-fill',
  'object-removal': 'object-removal',
  outpaint: 'ai-expand',
};
```

3. New local state `const [stylePrompt, setStylePrompt] = useState('');` and `const [bgReplacePrompt, setBgReplacePrompt] = useState('');` (the honest return of the PR1-removed knob). Store selection adds `editAiMask`, `editAiMaskTool`, `editAiMaskBrushSize`, `setEditAiMask`, `setEditAiMaskTool`, `setEditAiMaskBrushSize`, `setEditAiMaskDrawing`. Hook destructure adds `runGuided`.

4. Drawing-mode effect (after the store hooks):

```tsx
  // Opening a mask tool turns the canvas into a drawing surface; closing it
  // (or unmounting the panel) hands the pointer back.
  useEffect(() => {
    setEditAiMaskDrawing(expandedTool === 'gen-fill' || expandedTool === 'object-removal');
    return () => setEditAiMaskDrawing(false);
  }, [expandedTool, setEditAiMaskDrawing]);
```

(add `useEffect` to the react import.)

5. `handleApply` gains the guided branch before the early return:

```tsx
  const handleApply = (toolId: string) => {
    if (!canApply || !currentImageAssetPath) {
      return;
    }
    const guidedOperation = GUIDED_OPERATION_BY_TOOL[toolId];
    if (guidedOperation) {
      if (guidedOperation === 'style-transfer') {
        const preset = STYLE_PRESETS.find((style) => style.id === stylePreset);
        void runGuided('style-transfer', {
          source_path: currentImageAssetPath,
          styleModifier: preset?.modifier ?? '',
          styleStrength,
          prompt: stylePrompt,
        });
      } else if (guidedOperation === 'generative-fill') {
        void runGuided('generative-fill', {
          source_path: currentImageAssetPath,
          prompt: genFillPrompt,
          mask: editAiMask,
        });
      } else if (guidedOperation === 'object-removal') {
        void runGuided('object-removal', {
          source_path: currentImageAssetPath,
          mask: editAiMask,
        });
      } else {
        void runGuided('ai-expand', {
          source_path: currentImageAssetPath,
          prompt: expandPrompt,
          directions: expandDirection as ('up' | 'down' | 'left' | 'right')[],
          pixels: expandPixels,
        });
      }
      return;
    }
    const operation = OPERATION_BY_TOOL[toolId];
    if (!operation) {
      return;
    }
    /* existing PR1 dispatches unchanged */
  };
```

6. `isToolProcessing` resolves through both maps:

```tsx
  const isToolProcessing = (toolId: string) => {
    const operation = OPERATION_BY_TOOL[toolId] ?? GUIDED_OPERATION_BY_TOOL[toolId];
    return Boolean(isRunning && operation && runningOperation === operation);
  };
```

7. Shared mask-controls block rendered inside BOTH the gen-fill and object-removal cards (define once above the return as a local component or JSX helper):

```tsx
  const hasMask = Boolean(editAiMask && editAiMask.points.length > 0);

  const maskControls = (
    <div className="space-y-3" data-testid="edit-ai-mask-controls">
      <div className="space-y-1.5">
        <label className="text-label text-text-body">Mask Tool</label>
        <div className="flex gap-2">
          {([
            { id: 'brush', label: 'Brush' },
            { id: 'rectangle', label: 'Rectangle' },
          ] as const).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setEditAiMaskTool(id)}
              className={cn(
                'flex-1 py-2 rounded-md border text-sm font-medium transition-all',
                editAiMaskTool === id
                  ? 'border-accent-primary-border bg-accent-primary-muted text-accent-primary'
                  : 'border-border bg-surface text-text-body'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {editAiMaskTool === 'brush' && (
        <Slider
          label="Brush Size"
          value={editAiMaskBrushSize}
          min={10}
          max={150}
          onChange={setEditAiMaskBrushSize}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="type-caption text-text-muted">
          {hasMask ? 'Mask ready - draw again to replace it.' : 'Draw over the area on the image.'}
        </p>
        <button
          type="button"
          onClick={() => setEditAiMask(null)}
          disabled={!hasMask}
          className="raised-control px-2 py-1 type-caption text-text-body disabled:opacity-40"
        >
          Clear Mask
        </button>
      </div>
    </div>
  );
```

8. Per-card rewiring — every guided Apply becomes a live button with the PR1 loading pattern (`icon={isProcessing ? Loader2 : <ToolIcon>}`, `isLoading={isProcessing}`, `loadingLabel={processingLabel}`), captions removed:

   - **style-transfer**: add the optional subject input above the Apply button:
     ```tsx
     <input
       value={stylePrompt}
       onChange={(e) => setStylePrompt(e.target.value)}
       placeholder="Add extra description (optional)"
       aria-label="Style transfer description"
       className="w-full bg-surface border border-border rounded-md px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary transition-all"
     />
     ```
     Apply: `disabled={!canApply}`.
   - **gen-fill**: replace the static hint paragraph with `{maskControls}` (keep the prompt input). Apply: `disabled={!canApply || !hasMask || !genFillPrompt.trim()}`.
   - **object-removal**: replace the static hint with `{maskControls}` plus the honesty line:
     ```tsx
     <p className="type-caption text-text-muted">
       Removal is AI inpainting - the masked area is repainted from the surrounding scene.
     </p>
     ```
     Apply: `disabled={!canApply || !hasMask}`.
   - **outpaint**: pixels input gains `min={64} max={512}`; Apply: `disabled={!canApply || expandDirection.length === 0}`.
   - **bg-removal**: below the existing Remove Background button, add the replacement section (real inpaint, not the PR0 fake knob):
     ```tsx
     <div className="h-px bg-border" aria-hidden="true" />
     <input
       value={bgReplacePrompt}
       onChange={(e) => setBgReplacePrompt(e.target.value)}
       placeholder="Describe the new background..."
       aria-label="Replacement background description"
       className="w-full bg-surface border border-border rounded-md px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-primary transition-all"
     />
     <Button
       variant="secondary"
       size="sm"
       fullWidth
       icon={isRunning && runningOperation === 'background-replace' ? Loader2 : Replace}
       isLoading={isRunning && runningOperation === 'background-replace'}
       loadingLabel={processingLabel}
       disabled={!canApply || !bgReplacePrompt.trim()}
       onClick={() => {
         if (!currentImageAssetPath) return;
         void runGuided('background-replace', {
           source_path: currentImageAssetPath,
           prompt: bgReplacePrompt,
         });
       }}
       aria-label="Replace the background"
     >
       Replace Background
     </Button>
     ```
     (`Replace` joins the lucide-react import list. Note the bg-removal card hosts TWO operations; the Remove button's `isProcessing` keying via `OPERATION_BY_TOOL` is unaffected because `runningOperation` distinguishes them.)

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/components/edit/AIToolsPanel.test.tsx` and `npm run typecheck`
Expected: all pass; no occurrence of "Ships with the guided-pass update." anywhere in `src/`.

- [ ] **Step 5: Commit**

```bash
git add src/components/edit/AIToolsPanel.tsx src/components/edit/AIToolsPanel.test.tsx
git commit -m "feat(edit): wire style transfer, gen fill, object removal, AI expand to real guided passes (#34)"
```

---

### Task 11: real-weight smokes — outpaint + background replace (VS_REAL_SMOKE)

**Files:**
- Create: `backend/tests/test_guided_smoke_edit_passes_local.py` (mirror the gating/boilerplate of `test_edit_tools_smoke_local.py` and the generator-invocation convention of `test_guided_smoke_controlnet_local.py`)

- [ ] **Step 1: Write the smokes**

```python
"""#34 PR2 acceptance: real Edit-page guided-pass smokes (VS_REAL_SMOKE=1 only).

Requires torch + diffusers and the sd-1-5 record under VS_MODELS_DIR (the
background-replace smoke additionally needs edit-u2net + onnxruntime).
Generates a source scene, then runs the two new pre-step passes through the
real inpaint pipeline - the maintainer gate for AI Expand and Background
Replacement.
"""
import asyncio
import os
import pathlib
import sys
import tempfile

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

RUN = os.getenv("VS_REAL_SMOKE") == "1"
HAS_DEPS = False
try:
    import torch  # noqa: F401
    import diffusers  # noqa: F401

    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(
    not (RUN and HAS_DEPS), reason="set VS_REAL_SMOKE=1 with the full backend to run"
)

MODELS_DIR = os.environ.get("VS_MODELS_DIR", "models")


def test_outpaint_expands_a_real_image():
    import numpy as np
    from PIL import Image

    if not os.path.isfile(os.path.join(
            MODELS_DIR, "checkpoints", "v1-5-pruned-emaonly.safetensors")):
        pytest.skip("install sd-1-5 from the Foundry to run this smoke")

    import utils.direct_generator as dg

    output_dir = tempfile.mkdtemp()
    generator = dg.DirectGenerator(models_dir=MODELS_DIR, output_dir=output_dir)
    prompt = "a wide green meadow under a blue sky, distant horizon"

    source = asyncio.run(generator.generate_image(
        job_id="outpaint-smoke-src", prompt=prompt,
        width=384, height=384, steps=6, cfg_scale=7.0, seed=99,
        model_name="sd-1-5", scheduler="Euler a",
    ))
    source_path = os.path.join(
        output_dir, source["images"][0].split("/outputs/")[-1])

    expanded = asyncio.run(generator.generate_image(
        job_id="outpaint-smoke-run", prompt=prompt,
        width=512, height=384, steps=6, cfg_scale=7.0, seed=100,
        model_name="sd-1-5", scheduler="Euler a",
        guided={
            "outpaint": {"image_path": source_path,
                         "directions": ["right"], "pixels": 128},
            "denoising_strength": 1.0,
        },
    ))
    assert expanded["guided"]["pass"] == "outpaint"
    out = Image.open(os.path.join(
        output_dir, expanded["images"][0].split("/outputs/")[-1]))
    assert out.size == (512, 384)
    # The expanded band must carry real generated content, not a flat fill.
    band = np.asarray(out.convert("L"), dtype="float32")[:, 384:]
    assert float(band.var()) > 1.0


def test_background_replace_repaints_behind_a_real_subject():
    import numpy as np
    from PIL import Image

    if not os.path.isfile(os.path.join(
            MODELS_DIR, "checkpoints", "v1-5-pruned-emaonly.safetensors")):
        pytest.skip("install sd-1-5 from the Foundry to run this smoke")
    if not os.path.isfile(os.path.join(
            MODELS_DIR, "edit-model", "edit-u2net", "edit-u2net.onnx")):
        pytest.skip("install 'edit-u2net' from the Foundry to run this smoke")
    try:
        import onnxruntime  # noqa: F401
    except Exception:
        pytest.skip("onnxruntime missing")

    import utils.direct_generator as dg

    output_dir = tempfile.mkdtemp()
    generator = dg.DirectGenerator(models_dir=MODELS_DIR, output_dir=output_dir)

    source = asyncio.run(generator.generate_image(
        job_id="bgreplace-smoke-src",
        prompt=("product photo of a single red apple centered on a plain "
                "white table, white background, studio lighting"),
        width=384, height=384, steps=6, cfg_scale=7.0, seed=4321,
        model_name="sd-1-5", scheduler="Euler a",
    ))
    source_path = os.path.join(
        output_dir, source["images"][0].split("/outputs/")[-1])
    source_image = Image.open(source_path).convert("RGB")

    replaced = asyncio.run(generator.generate_image(
        job_id="bgreplace-smoke-run",
        prompt="a sandy beach at sunset, ocean waves in the distance",
        width=384, height=384, steps=6, cfg_scale=7.0, seed=4322,
        model_name="sd-1-5", scheduler="Euler a",
        guided={
            "background_replace": {"image_path": source_path},
            "denoising_strength": 1.0,
        },
    ))
    assert replaced["guided"]["pass"] == "background-replace"
    out = Image.open(os.path.join(
        output_dir, replaced["images"][0].split("/outputs/")[-1])).convert("RGB")
    assert out.size == source_image.size
    diff = np.abs(
        np.asarray(out, dtype="int16") - np.asarray(source_image, dtype="int16"))
    height, width = diff.shape[:2]
    center = diff[height // 3: 2 * height // 3, width // 3: 2 * width // 3]
    corners = np.concatenate([
        diff[:32, :32].ravel(), diff[:32, -32:].ravel(),
        diff[-32:, :32].ravel(), diff[-32:, -32:].ravel(),
    ])
    assert float(corners.mean()) > 10.0, "the background must actually change"
    assert float(center.mean()) < float(corners.mean()), (
        "the subject region must change less than the repainted background")
```

(If `generate_image` threads `guided` under a different kwarg, copy the exact convention from `test_guided_smoke_controlnet_local.py` / `main.py`'s `process_image_generation` call.)

- [ ] **Step 2: Verify it skips cleanly without the gate**

Run: `venv/Scripts/python.exe -m pytest tests/test_guided_smoke_edit_passes_local.py -v`
Expected: 2 skipped.

- [ ] **Step 3: Run it for real** (CPU, several minutes per test)

Run: `VS_REAL_SMOKE=1 VS_MODELS_DIR=<models dir> venv/Scripts/python.exe -m pytest tests/test_guided_smoke_edit_passes_local.py -v -s`
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_guided_smoke_edit_passes_local.py
git commit -m "test(edit): real-weight outpaint + background-replace acceptance smokes (#34)"
```

---

### Task 12: full gates

- [ ] Backend: from `backend/`, `venv/Scripts/python.exe -m pytest -q` — expected: all pass (plus skips).
- [ ] Frontend: `npm run typecheck` then `npm test` — expected: green.
- [ ] Build: `npm run build` — expected: green.
- [ ] Grep honesty sweep: `Ships with the guided-pass update` appears nowhere in `src/`; no `setTimeout` theater reintroduced.
- [ ] Fix anything red before opening the PR; commit fixes individually with honest messages.

---

## Self-Review Notes

- **Spec coverage:** §5 Style Transfer (Task 8/10), Gen Fill + Object Removal masks via RegionMaskDrawer + 1:1 payload conversion (Tasks 6/8/9/10), AI Expand backend pre-step `outpaint: {directions, pixels}` (Tasks 1–4), Background Replacement as inverted-u2net-mask inpaint with `bgReplacePrompt` (Tasks 2–5, 8, 10 — exactly the §5 mechanism), honest no-checkpoint refusal (Task 8), results landing through the shared handoff (Task 7). After this PR every surface the Edit page advertises is real.
- **Type consistency:** `GuidedEditOperation` values match `GUIDED_OPERATION_BY_TOOL` plus the bg-removal card's replace dispatch; `outpaint`/`background_replace` payload field names match the backend schema; `editAiMask*` names identical across slice/types/panel/canvas.
- **Placeholder scan:** none — every step carries code or an exact command.
- **Note on `background_replace` prompt threading:** the payload deliberately carries only `image_path`; the new-background description rides the request's main `prompt` (resolve_guided_pass's `prompt_override` stays None, so `effective_prompt = request.prompt`). The builder and panel follow this.
