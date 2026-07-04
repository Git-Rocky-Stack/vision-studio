# Guided Passes PR1: img2img + inpaint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the img2img (reference image) and inpaint (masked edit) passes the frontend already sends real on the local generator - consumed by real diffusers pipeline variants instead of silently dropped at the schema boundary.

**Architecture:** New `backend/guided/` package (mask rasterizer, pass resolution, pipeline-variant derivation) consumed by `utils/direct_generator.py`. Variants derive from the cached base pipeline via diffusers `AutoPipelineFor*.from_pipe()` (shared weights, no second checkpoint copy); FLUX inpaint routes to the catalogued `flux-fill` model. Pre-flight validation returns 422 before job creation; runtime pass failure fails the job - never silent degradation to txt2img.

**Tech Stack:** FastAPI/pydantic, diffusers `AutoPipelineForImage2Image` / `AutoPipelineForInpainting` `.from_pipe()`, PIL `ImageDraw` rasterization, React/TS payload threading.

**Spec:** `docs/superpowers/specs/2026-07-04-guided-passes-end-to-end-design.md` (PR1 of 4). PR2 (ControlNet SD1.5/SDXL), PR3 (FLUX/SD3.5 CN + fit + UI reconciliation), and PR4 (IP-Adapter) get their own plan docs as each PR lands.

## Global Constraints

- Branch: `feat/guided-passes-end-to-end` (already created; spec committed on it).
- Commit via the **Bash tool** with `export PATH="/c/Program Files/nodejs:$PATH"` first; `git branch --show-current` in the same call as every commit; stage explicit paths only (**never `git add -A`** - `LICENSE.txt` stays untracked); never `--no-verify`.
- Backend tests run with `backend/venv/Scripts/python.exe -m pytest` (bare `python` is a dep-less system 3.14).
- `backend/guided/` must import with **no torch/diffusers installed** (stub CI). Heavy imports live in try/except or inside functions.
- Zero new model weights in PR1. Zero new Python deps (PIL + numpy already shipped).
- Honesty rails: guided-pass failure = failed request (422) or failed job - **never** silent fallback to unguided output. ControlNet layers 422 with a clear message until PR2 lands. Error messages never contain filesystem paths (basenames only).
- No emoji in `src/` (ui-glyphs guard); no new `--spacing-*` tokens.
- Gates before the PR: `npm run typecheck`, `npm test`, `npm run build`, backend pytest - all green.
- **PAUSE for user review before merging the PR** (release-process rule).

## File Structure

| File | Responsibility |
|------|----------------|
| Create `backend/guided/__init__.py` | Package marker (empty) |
| Create `backend/guided/masks.py` | Vector mask payload -> PIL `L` image; coverage helper. Sole owner of mask geometry |
| Create `backend/guided/passes.py` | Request fields -> validated `GuidedPassPlan`; all 422 message strings live here |
| Create `backend/guided/pipelines.py` | Variant derivation via `from_pipe`; signature-filtered call kwargs |
| Modify `backend/main.py` | Payload models + `ImageGenerationRequest` fields; endpoint pre-flight 422; thread `guided` dict into the generator |
| Modify `backend/utils/direct_generator.py` | Guided branch in `_generate_sync`; flux-fill routing; `guided` result report |
| Create `backend/tests/test_guided_masks.py` | Rasterizer unit tests |
| Create `backend/tests/test_guided_passes.py` | Pass-resolution/validation unit tests |
| Create `backend/tests/test_guided_pipelines.py` | Variant derivation + kwargs filter unit tests |
| Create `backend/tests/test_guided_request.py` | Schema + endpoint pre-flight tests |
| Create `backend/tests/test_direct_generator_guided.py` | Fake-pipeline integration (mirrors `test_direct_generator_loras.py`) |
| Create `backend/tests/test_guided_smoke_local.py` | Env-gated real-model smoke (off on CI and normal local runs) |
| Modify `src/types/project.ts` | `RegionMask.brushSize?: number` |
| Modify `src/types/generation.ts` | `GenerationMaskPayload.brush_size?`, `ImageGenerationRequestPayload.denoising_strength?` |
| Modify `src/components/edit/RegionMaskDrawer.tsx` | Commit `brushSize` with brush/erase masks |
| Modify `src/components/layout/Canvas.tsx` | Thread `brushSize` through `handleMaskCommit` |
| Modify `src/features/generation/resolveCanvasControlLayers.ts` | Project `brush_size` into mask payloads |
| Modify `src/pages/GeneratePanel.tsx` | Thread `denoising_strength` when a guided pass is present |

---

### Task 1: Mask rasterizer (`backend/guided/masks.py`)

**Files:**
- Create: `backend/guided/__init__.py` (empty file)
- Create: `backend/guided/masks.py`
- Test: `backend/tests/test_guided_masks.py`

**Interfaces:**
- Consumes: nothing (leaf module; PIL only - already a core dep).
- Produces: `rasterize_mask(mask: dict, width: int, height: int) -> PIL.Image.Image` (mode `"L"`, white=selected) and `mask_coverage(image) -> float` (fraction of nonzero pixels, 0.0-1.0). Mask dict shape: `{"type": "rectangle"|"polygon"|"brush"|"erase", "points": [{"x": float, "y": float}], "bounds": {"x","y","width","height"}, "brush_size": float|None}` - coordinates are **intrinsic image pixels** (the canvas drawer emits them scaled to the base image's size; see `RegionMaskDrawer.getLocalPoint`).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_guided_masks.py
"""#34 PR1: vector canvas masks -> PIL L masks. Pure PIL - runs on stub CI."""
import pytest

from guided.masks import mask_coverage, rasterize_mask


def _mask(mask_type, points, bounds, brush_size=None):
    return {
        "type": mask_type,
        "points": [{"x": x, "y": y} for x, y in points],
        "bounds": bounds,
        "brush_size": brush_size,
    }


def test_rectangle_fills_bounds():
    mask = _mask("rectangle", [(10, 10), (50, 10), (50, 30), (10, 30)],
                 {"x": 10, "y": 10, "width": 40, "height": 20})
    img = rasterize_mask(mask, 100, 100)
    assert img.mode == "L"
    assert img.size == (100, 100)
    assert img.getpixel((30, 20)) == 255   # inside
    assert img.getpixel((5, 5)) == 0       # outside
    assert img.getpixel((80, 80)) == 0


def test_polygon_fills_interior_only():
    mask = _mask("polygon", [(0, 0), (60, 0), (0, 60)],
                 {"x": 0, "y": 0, "width": 60, "height": 60})
    img = rasterize_mask(mask, 100, 100)
    assert img.getpixel((10, 10)) == 255   # inside the triangle
    assert img.getpixel((59, 59)) == 0     # outside the hypotenuse


def test_brush_stroke_covers_path_with_width():
    mask = _mask("brush", [(20, 50), (80, 50)],
                 {"x": 20, "y": 50, "width": 60, "height": 0}, brush_size=10)
    img = rasterize_mask(mask, 100, 100)
    assert img.getpixel((50, 50)) == 255   # on the stroke
    assert img.getpixel((50, 54)) == 255   # within radius (10/2 = 5px)
    assert img.getpixel((50, 70)) == 0     # far off the stroke


def test_brush_without_brush_size_uses_default_radius():
    mask = _mask("brush", [(20, 50), (80, 50)],
                 {"x": 20, "y": 50, "width": 60, "height": 0})
    img = rasterize_mask(mask, 100, 100)
    assert img.getpixel((50, 50)) == 255
    assert mask_coverage(img) > 0.0


def test_erase_alone_produces_empty_mask():
    # A standalone erase stroke subtracts from nothing - honest empty result.
    mask = _mask("erase", [(20, 50), (80, 50)],
                 {"x": 20, "y": 50, "width": 60, "height": 0}, brush_size=10)
    img = rasterize_mask(mask, 100, 100)
    assert mask_coverage(img) == 0.0


def test_points_clamped_to_canvas():
    mask = _mask("rectangle", [(-10, -10), (500, -10), (500, 500), (-10, 500)],
                 {"x": -10, "y": -10, "width": 510, "height": 510})
    img = rasterize_mask(mask, 100, 100)
    assert img.getpixel((50, 50)) == 255
    assert img.size == (100, 100)


def test_empty_points_produce_empty_mask():
    mask = _mask("polygon", [], {"x": 0, "y": 0, "width": 0, "height": 0})
    img = rasterize_mask(mask, 100, 100)
    assert mask_coverage(img) == 0.0


def test_unknown_type_raises():
    mask = _mask("lasso", [(1, 1)], {"x": 0, "y": 0, "width": 2, "height": 2})
    with pytest.raises(ValueError):
        rasterize_mask(mask, 100, 100)


def test_coverage_fraction():
    mask = _mask("rectangle", [(0, 0), (50, 0), (50, 100), (0, 100)],
                 {"x": 0, "y": 0, "width": 50, "height": 100})
    img = rasterize_mask(mask, 100, 100)
    assert 0.45 < mask_coverage(img) < 0.55
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_masks.py -q`
Expected: FAIL - `ModuleNotFoundError: No module named 'guided'`

- [ ] **Step 3: Write the implementation**

```python
# backend/guided/masks.py
"""#34 PR1: rasterize canvas vector masks into PIL L-mode mask images.

The canvas drawer (RegionMaskDrawer) emits points in intrinsic image pixel
coordinates. Rasterize at the base image's size, then resize alongside it.
White (255) = selected. Pure PIL - loads and runs on stub CI.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

from PIL import Image, ImageDraw

# Brush strokes without a recorded width get a radius proportional to the
# canvas diagonal (matches the drawer's visual default closely enough to be
# unsurprising), floored so tiny canvases still get a visible stroke.
DEFAULT_BRUSH_FRACTION = 0.02
MIN_BRUSH_RADIUS = 6.0

_KNOWN_TYPES = {"rectangle", "polygon", "brush", "erase"}


def _clamped_points(mask: Dict[str, Any], width: int, height: int) -> List[Tuple[float, float]]:
    points = []
    for point in mask.get("points") or []:
        x = min(max(float(point.get("x", 0.0)), 0.0), float(width))
        y = min(max(float(point.get("y", 0.0)), 0.0), float(height))
        points.append((x, y))
    return points


def _brush_radius(mask: Dict[str, Any], width: int, height: int) -> float:
    brush_size = mask.get("brush_size")
    if brush_size:
        return max(1.0, float(brush_size) / 2.0)
    return max(MIN_BRUSH_RADIUS, DEFAULT_BRUSH_FRACTION * math.hypot(width, height))


def _draw_stroke(draw: ImageDraw.ImageDraw, points: List[Tuple[float, float]], radius: float) -> None:
    if len(points) >= 2:
        draw.line(points, fill=255, width=max(1, int(round(radius * 2))))
    # Round caps/joints so sharp direction changes stay solid.
    for x, y in points:
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=255)


def rasterize_mask(mask: Dict[str, Any], width: int, height: int) -> Image.Image:
    """Vector mask payload -> L-mode image at (width, height). White = selected.

    A standalone 'erase' mask subtracts from nothing and therefore rasterizes
    empty - callers detect that via mask_coverage() and refuse honestly.
    """
    mask_type = mask.get("type")
    if mask_type not in _KNOWN_TYPES:
        raise ValueError(f"unknown mask type '{mask_type}'")

    image = Image.new("L", (max(1, int(width)), max(1, int(height))), 0)
    points = _clamped_points(mask, width, height)
    if not points or mask_type == "erase":
        return image

    draw = ImageDraw.Draw(image)
    if mask_type == "rectangle":
        bounds = mask.get("bounds") or {}
        x1 = min(max(float(bounds.get("x", 0.0)), 0.0), float(width))
        y1 = min(max(float(bounds.get("y", 0.0)), 0.0), float(height))
        x2 = min(x1 + max(0.0, float(bounds.get("width", 0.0))), float(width))
        y2 = min(y1 + max(0.0, float(bounds.get("height", 0.0))), float(height))
        draw.rectangle([x1, y1, x2, y2], fill=255)
    elif mask_type == "polygon":
        if len(points) >= 3:
            draw.polygon(points, fill=255)
        else:
            _draw_stroke(draw, points, _brush_radius(mask, width, height))
    else:  # brush
        _draw_stroke(draw, points, _brush_radius(mask, width, height))
    return image


def mask_coverage(image: Image.Image) -> float:
    """Fraction of nonzero pixels (0.0-1.0)."""
    histogram = image.histogram()
    total = image.size[0] * image.size[1]
    if total == 0:
        return 0.0
    return 1.0 - (histogram[0] / total)
```

Also create `backend/guided/__init__.py` as an empty file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_masks.py -q`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git add backend/guided/__init__.py backend/guided/masks.py backend/tests/test_guided_masks.py && git branch --show-current && git commit -m "feat(guided): vector-mask rasterizer - rectangle/polygon/brush/erase to PIL L masks (#34)"
```

---

### Task 2: Guided pass resolution (`backend/guided/passes.py`)

**Files:**
- Create: `backend/guided/passes.py`
- Test: `backend/tests/test_guided_passes.py`

**Interfaces:**
- Consumes: plain dicts (the pydantic models' `.dict()` output).
- Produces:
  - `class GuidedValidationError(ValueError)` - message is user-facing, path-free.
  - `@dataclass GuidedPassPlan`: `kind: str` (`"none" | "img2img" | "inpaint"`), `image_path: Optional[str]`, `mask: Optional[dict]`, `strength: float`, `prompt_override: Optional[str]`, `negative_prompt_override: Optional[str]`, `notices: List[str]`.
  - `resolve_guided_pass(controlnet, reference_images, inpaint, denoising_strength) -> GuidedPassPlan` - THE validation seam; `main.py` calls it for pre-flight 422 and `direct_generator` re-resolves it in the worker (pure + cheap = one source of truth).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_guided_passes.py
"""#34 PR1: guided-pass resolution + honesty-rail validation. Pure - stub CI safe."""
import pytest

from guided.passes import GuidedValidationError, resolve_guided_pass

MASK = {"type": "rectangle", "points": [{"x": 0, "y": 0}], "bounds": {"x": 0, "y": 0, "width": 8, "height": 8}}


def test_no_guided_fields_resolves_none():
    plan = resolve_guided_pass([], [], None, 0.75)
    assert plan.kind == "none"
    assert plan.notices == []


def test_controlnet_layers_are_declined_until_pr2():
    layer = {"layer_id": "c1", "source_path": "x.png", "preprocessor": "canny", "mask": MASK}
    with pytest.raises(GuidedValidationError) as ctx:
        resolve_guided_pass([layer], [], None, 0.75)
    assert "ControlNet" in str(ctx.value)


def test_single_reference_resolves_img2img_with_mask_notice():
    ref = {"layer_id": "r1", "source_path": "ref.png", "mask": MASK, "strength": 1.0}
    plan = resolve_guided_pass([], [ref], None, 0.6)
    assert plan.kind == "img2img"
    assert plan.image_path == "ref.png"
    assert plan.strength == 0.6
    assert any("mask" in n.lower() for n in plan.notices)


def test_multiple_references_are_declined_until_pr4():
    refs = [
        {"layer_id": "r1", "source_path": "a.png", "mask": MASK},
        {"layer_id": "r2", "source_path": "b.png", "mask": MASK},
    ]
    with pytest.raises(GuidedValidationError) as ctx:
        resolve_guided_pass([], refs, None, 0.75)
    assert "reference" in str(ctx.value).lower()


def test_inpaint_resolves_with_prompt_overrides():
    inpaint = {"layer_id": "i1", "image_path": "base.png", "mask": MASK,
               "prompt": "a red door", "negative_prompt": "blurry"}
    plan = resolve_guided_pass([], [], inpaint, 0.9)
    assert plan.kind == "inpaint"
    assert plan.image_path == "base.png"
    assert plan.mask == MASK
    assert plan.strength == 0.9
    assert plan.prompt_override == "a red door"
    assert plan.negative_prompt_override == "blurry"


def test_inpaint_blank_prompt_override_is_none():
    inpaint = {"layer_id": "i1", "image_path": "base.png", "mask": MASK, "prompt": "  "}
    plan = resolve_guided_pass([], [], inpaint, 0.75)
    assert plan.prompt_override is None


def test_inpaint_plus_reference_is_declined():
    ref = {"layer_id": "r1", "source_path": "ref.png", "mask": MASK}
    inpaint = {"layer_id": "i1", "image_path": "base.png", "mask": MASK}
    with pytest.raises(GuidedValidationError):
        resolve_guided_pass([], [ref], inpaint, 0.75)


def test_error_messages_never_contain_paths():
    refs = [
        {"layer_id": "r1", "source_path": "C:/secret/a.png", "mask": MASK},
        {"layer_id": "r2", "source_path": "C:/secret/b.png", "mask": MASK},
    ]
    with pytest.raises(GuidedValidationError) as ctx:
        resolve_guided_pass([], refs, None, 0.75)
    assert "secret" not in str(ctx.value)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_passes.py -q`
Expected: FAIL - `ImportError: cannot import name 'resolve_guided_pass'`

- [ ] **Step 3: Write the implementation**

```python
# backend/guided/passes.py
"""#34 PR1: resolve the request's guided-pass fields into one validated plan.

THE honesty seam: everything the schema accepts either resolves into a pass
that will really run, or raises GuidedValidationError with a user-facing,
path-free message. main.py converts that to a pre-flight 422; the generator
re-resolves in the worker (pure + cheap) so there is one source of truth.
No heavy imports - loads on stub CI.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# User-facing decline messages (honesty rails - see the PR1 spec).
MSG_CONTROLNET_NOT_YET = (
    "ControlNet layers are not supported by the local engine yet - hide or "
    "remove the ControlNet layer(s) to generate. ControlNet support lands in "
    "the next update (#34)."
)
MSG_MULTI_REFERENCE_NOT_YET = (
    "Multiple reference images need IP-Adapter support, which is not "
    "available yet - keep one visible reference image layer (#34)."
)
MSG_INPAINT_PLUS_REFERENCE = (
    "Use either an inpaint mask or a reference image layer for a single "
    "generation - combining them is not supported yet (#34)."
)
NOTICE_REFERENCE_MASK_IGNORED = (
    "Reference mask not applied: single-reference passes run full-image "
    "img2img until IP-Adapter support lands (#34)."
)


class GuidedValidationError(ValueError):
    """User-facing guided-pass validation failure (never contains paths)."""


@dataclass
class GuidedPassPlan:
    kind: str = "none"  # "none" | "img2img" | "inpaint"
    image_path: Optional[str] = None
    mask: Optional[Dict[str, Any]] = None
    strength: float = 0.75
    prompt_override: Optional[str] = None
    negative_prompt_override: Optional[str] = None
    notices: List[str] = field(default_factory=list)


def _clean(text: Optional[str]) -> Optional[str]:
    text = (text or "").strip()
    return text or None


def resolve_guided_pass(
    controlnet: Optional[List[Dict[str, Any]]],
    reference_images: Optional[List[Dict[str, Any]]],
    inpaint: Optional[Dict[str, Any]],
    denoising_strength: float,
) -> GuidedPassPlan:
    controlnet = controlnet or []
    reference_images = reference_images or []

    if controlnet:
        raise GuidedValidationError(MSG_CONTROLNET_NOT_YET)
    if len(reference_images) > 1:
        raise GuidedValidationError(MSG_MULTI_REFERENCE_NOT_YET)
    if inpaint and reference_images:
        raise GuidedValidationError(MSG_INPAINT_PLUS_REFERENCE)

    if inpaint:
        return GuidedPassPlan(
            kind="inpaint",
            image_path=inpaint.get("image_path"),
            mask=inpaint.get("mask"),
            strength=denoising_strength,
            prompt_override=_clean(inpaint.get("prompt")),
            negative_prompt_override=_clean(inpaint.get("negative_prompt")),
        )

    if reference_images:
        reference = reference_images[0]
        return GuidedPassPlan(
            kind="img2img",
            image_path=reference.get("source_path"),
            mask=None,  # honestly not applied - see the notice
            strength=denoising_strength,
            notices=[NOTICE_REFERENCE_MASK_IGNORED],
        )

    return GuidedPassPlan()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_passes.py -q`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git add backend/guided/passes.py backend/tests/test_guided_passes.py && git branch --show-current && git commit -m "feat(guided): pass resolution + honesty-rail validation - img2img/inpaint/declines (#34)"
```

---

### Task 3: Pipeline variant derivation (`backend/guided/pipelines.py`)

**Files:**
- Create: `backend/guided/pipelines.py`
- Test: `backend/tests/test_guided_pipelines.py`

**Interfaces:**
- Consumes: a loaded diffusers pipeline (any family).
- Produces:
  - `derive_variant(base_pipeline, kind: str)` - `"img2img"` -> `diffusers.AutoPipelineForImage2Image.from_pipe(base)`, `"inpaint"` -> `diffusers.AutoPipelineForInpainting.from_pipe(base)`; raises `ValueError` on other kinds and `RuntimeError` when diffusers is absent.
  - `filter_call_kwargs(pipeline, kwargs: dict) -> tuple[dict, list[str]]` - keeps only kwargs the pipeline's `__call__` accepts; returns `(filtered, dropped_names)`. This is how family differences (FluxFill has no `strength`/`negative_prompt`) are handled without name-sniffing - and the dropped names are REPORTED in the job result, never silently discarded.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_guided_pipelines.py
"""#34 PR1: variant derivation + signature-filtered kwargs. Stub CI safe."""
import types

import pytest

import guided.pipelines as gp
from guided.pipelines import derive_variant, filter_call_kwargs


class _FakeAutoPipeline:
    seen = None

    @classmethod
    def from_pipe(cls, base):
        cls.seen = base
        return ("derived", base)


def _fake_diffusers():
    module = types.SimpleNamespace()
    module.AutoPipelineForImage2Image = type("A2I", (_FakeAutoPipeline,), {})
    module.AutoPipelineForInpainting = type("A2P", (_FakeAutoPipeline,), {})
    return module


def test_derive_img2img_uses_from_pipe(monkeypatch):
    fake = _fake_diffusers()
    monkeypatch.setattr(gp, "diffusers", fake)
    base = object()
    assert derive_variant(base, "img2img") == ("derived", base)
    assert fake.AutoPipelineForImage2Image.seen is base


def test_derive_inpaint_uses_from_pipe(monkeypatch):
    fake = _fake_diffusers()
    monkeypatch.setattr(gp, "diffusers", fake)
    base = object()
    assert derive_variant(base, "inpaint") == ("derived", base)
    assert fake.AutoPipelineForInpainting.seen is base


def test_derive_unknown_kind_raises(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", _fake_diffusers())
    with pytest.raises(ValueError):
        derive_variant(object(), "controlnet")


def test_derive_without_diffusers_raises(monkeypatch):
    monkeypatch.setattr(gp, "diffusers", None)
    with pytest.raises(RuntimeError):
        derive_variant(object(), "img2img")


class _StrengthlessPipeline:
    def __call__(self, prompt, image, mask_image, num_inference_steps=25,
                 guidance_scale=7.5, generator=None, callback_on_step_end=None,
                 width=None, height=None):
        return None


def test_filter_call_kwargs_drops_and_reports_unsupported():
    kwargs = {
        "prompt": "x", "image": "img", "mask_image": "mask",
        "strength": 0.75, "negative_prompt": "bad",
        "num_inference_steps": 4, "guidance_scale": 7.5,
    }
    filtered, dropped = filter_call_kwargs(_StrengthlessPipeline(), kwargs)
    assert "strength" not in filtered
    assert "negative_prompt" not in filtered
    assert filtered["prompt"] == "x"
    assert sorted(dropped) == ["negative_prompt", "strength"]


def test_filter_call_kwargs_keeps_everything_supported():
    class Full:
        def __call__(self, prompt, negative_prompt=None, strength=0.8, image=None):
            return None

    filtered, dropped = filter_call_kwargs(Full(), {"prompt": "x", "strength": 0.5})
    assert filtered == {"prompt": "x", "strength": 0.5}
    assert dropped == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_pipelines.py -q`
Expected: FAIL - `ModuleNotFoundError: No module named 'guided.pipelines'`

- [ ] **Step 3: Write the implementation**

```python
# backend/guided/pipelines.py
"""#34 PR1: derive guided-pass pipeline variants from the cached base pipeline.

from_pipe() shares the already-loaded components (no second checkpoint copy),
which is why guided passes cost no extra VRAM beyond the base model. The
kwargs filter handles per-family __call__ differences (FluxFill has no
strength/negative_prompt) by signature inspection - never name-sniffing -
and callers report the dropped names in the job result.
"""
from __future__ import annotations

import inspect
from typing import Any, Dict, List, Tuple

try:
    import diffusers
except ImportError:  # stub CI - the API surface still imports
    diffusers = None  # type: ignore[assignment]

_VARIANT_CLASSES = {
    "img2img": "AutoPipelineForImage2Image",
    "inpaint": "AutoPipelineForInpainting",
}


def derive_variant(base_pipeline: Any, kind: str) -> Any:
    """Derive the img2img/inpaint variant of a loaded pipeline via from_pipe."""
    class_name = _VARIANT_CLASSES.get(kind)
    if class_name is None:
        raise ValueError(f"no pipeline variant for guided pass '{kind}'")
    if diffusers is None:
        raise RuntimeError("diffusers is not available - guided passes need the full backend")
    auto_class = getattr(diffusers, class_name)
    return auto_class.from_pipe(base_pipeline)


def filter_call_kwargs(pipeline: Any, kwargs: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """Keep only kwargs pipeline.__call__ accepts; report what was dropped."""
    parameters = inspect.signature(pipeline.__call__).parameters
    if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in parameters.values()):
        return dict(kwargs), []
    filtered = {k: v for k, v in kwargs.items() if k in parameters}
    dropped = sorted(k for k in kwargs if k not in parameters)
    return filtered, dropped
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_pipelines.py -q`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git add backend/guided/pipelines.py backend/tests/test_guided_pipelines.py && git branch --show-current && git commit -m "feat(guided): from_pipe variant derivation + signature-filtered call kwargs (#34)"
```

---

### Task 4: Request schema + endpoint pre-flight (`backend/main.py`)

**Files:**
- Modify: `backend/main.py` (payload models near `LoraSelection` at ~line 429; `ImageGenerationRequest` at ~line 434; the `/api/generate/image` endpoint at ~line 1109; the `run_image_generation` call at ~line 1340)
- Test: `backend/tests/test_guided_request.py`

**Interfaces:**
- Consumes: `guided.passes.resolve_guided_pass` / `GuidedValidationError` (Task 2).
- Produces (for Task 5): the generator call gains `guided=_guided_payload(request)` where `_guided_payload -> Optional[dict]` with keys `controlnet` (list of dicts), `reference_images` (list of dicts), `inpaint` (dict or None), `denoising_strength` (float) - or `None` when the request has no guided fields.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_guided_request.py
"""#34 PR1: guided fields on ImageGenerationRequest + pre-flight 422s."""
import pytest
from pydantic import ValidationError

from main import ImageGenerationRequest, VideoGenerationRequest, _guided_payload

MASK = {"type": "rectangle", "points": [{"x": 0, "y": 0}], "bounds": {"x": 0, "y": 0, "width": 8, "height": 8}}


def test_image_request_accepts_guided_fields():
    req = ImageGenerationRequest(
        prompt="x",
        reference_images=[{"layer_id": "r1", "source_path": "ref.png", "mask": MASK}],
        denoising_strength=0.6,
    )
    assert req.reference_images[0].source_path == "ref.png"
    assert req.denoising_strength == 0.6


def test_image_request_accepts_inpaint_with_brush_size_mask():
    mask = dict(MASK, type="brush", brush_size=24.0)
    req = ImageGenerationRequest(
        prompt="x",
        inpaint={"layer_id": "i1", "image_path": "base.png", "mask": mask},
    )
    assert req.inpaint.mask.brush_size == 24.0


def test_guided_defaults_are_empty():
    req = ImageGenerationRequest(prompt="x")
    assert req.controlnet == []
    assert req.reference_images == []
    assert req.inpaint is None
    assert req.denoising_strength == 0.75


def test_denoising_strength_range_enforced():
    with pytest.raises(ValidationError):
        ImageGenerationRequest(prompt="x", denoising_strength=1.5)
    with pytest.raises(ValidationError):
        ImageGenerationRequest(prompt="x", denoising_strength=0.0)


def test_video_request_has_no_guided_fields():
    req = VideoGenerationRequest(prompt="x")
    assert not hasattr(req, "controlnet")
    assert not hasattr(req, "inpaint")


def test_guided_payload_none_when_no_guided_fields():
    assert _guided_payload(ImageGenerationRequest(prompt="x")) is None


def test_guided_payload_projects_dicts():
    req = ImageGenerationRequest(
        prompt="x",
        inpaint={"layer_id": "i1", "image_path": "base.png", "mask": MASK, "prompt": "door"},
        denoising_strength=0.9,
    )
    payload = _guided_payload(req)
    assert payload["inpaint"]["image_path"] == "base.png"
    assert payload["inpaint"]["prompt"] == "door"
    assert payload["denoising_strength"] == 0.9
    assert payload["controlnet"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_request.py -q`
Expected: FAIL - `ImportError: cannot import name '_guided_payload'`

- [ ] **Step 3: Add the payload models and request fields**

In `backend/main.py`, directly after the `LoraSelection` class (~line 431), add:

```python
class GuidedMaskPayload(BaseModel):
    """#34: vector mask from the canvas drawer, in intrinsic image pixels."""
    type: str = Field(..., description="rectangle | polygon | brush | erase")
    points: List[Dict[str, float]] = Field(default_factory=list)
    bounds: Dict[str, float] = Field(default_factory=dict)
    brush_size: Optional[float] = Field(default=None, ge=1, le=512)


class ControlNetLayerPayload(BaseModel):
    """#34: accepted so the decline is honest (support lands in PR2)."""
    layer_id: str
    layer_name: str = ""
    source_path: str
    preprocessor: str
    strength: float = Field(default=1.0, ge=0.0, le=2.0)
    start_step: float = Field(default=0.0, ge=0.0, le=1.0)
    end_step: float = Field(default=1.0, ge=0.0, le=1.0)
    mask: GuidedMaskPayload
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None


class ReferenceImageLayerPayload(BaseModel):
    """#34: one visible reference layer -> img2img init (IP-Adapter in PR4)."""
    layer_id: str
    layer_name: str = ""
    source_path: str
    mask: GuidedMaskPayload
    strength: float = Field(default=1.0, ge=0.0, le=2.0)


class InpaintPassPayload(BaseModel):
    """#34: masked edit of the canvas base image."""
    layer_id: str
    layer_name: str = ""
    image_path: str
    mask: GuidedMaskPayload
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
```

Extend `ImageGenerationRequest` (NOT `VideoGenerationRequest` - canvas layers are image-only) with:

```python
    controlnet: List[ControlNetLayerPayload] = Field(
        default_factory=list, description="#34 canvas ControlNet layers (declined until PR2)")
    reference_images: List[ReferenceImageLayerPayload] = Field(
        default_factory=list, description="#34 reference image layers (img2img)")
    inpaint: Optional[InpaintPassPayload] = Field(
        default=None, description="#34 inpaint pass (base image + mask)")
    denoising_strength: float = Field(
        default=0.75, ge=0.05, le=1.0, description="#34 img2img/inpaint strength")
```

And add the projection helper after the model definitions:

```python
def _guided_payload(request: "ImageGenerationRequest") -> Optional[Dict[str, Any]]:
    """#34: project the request's guided fields into the generator's dict seam."""
    if not (request.controlnet or request.reference_images or request.inpaint):
        return None
    return {
        "controlnet": [layer.dict() for layer in request.controlnet],
        "reference_images": [layer.dict() for layer in request.reference_images],
        "inpaint": request.inpaint.dict() if request.inpaint else None,
        "denoising_strength": request.denoising_strength,
    }
```

- [ ] **Step 4: Wire pre-flight validation into the endpoint**

At the top of `backend/main.py` with the other foundry imports, add:

```python
from guided.passes import GuidedValidationError, resolve_guided_pass
```

Inside `async def generate_image(...)` (~line 1109), BEFORE the job is created (before `job_id = str(uuid.uuid4())`), add:

```python
    # #34 pre-flight: guided passes either resolve into a real pass or 422 -
    # a job is never created for a request that would silently drop layers.
    guided = _guided_payload(gen_request)
    if guided is not None:
        try:
            pass_plan = resolve_guided_pass(
                guided["controlnet"], guided["reference_images"],
                guided["inpaint"], guided["denoising_strength"],
            )
        except GuidedValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        if pass_plan.kind != "none":
            if not os.path.isfile(pass_plan.image_path or ""):
                name = os.path.basename(pass_plan.image_path or "")
                raise HTTPException(
                    status_code=422,
                    detail=f"Guided-pass source image '{name}' was not found on disk.",
                )
            if pass_plan.kind == "inpaint":
                record = model_registry.get_record(gen_request.model) or {}
                if record.get("base_architecture") == "flux":
                    fill = model_registry.get_record("flux-fill") or {}
                    if not any(os.path.exists(loc) for loc in fill.get("locations") or []):
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "FLUX inpainting uses the FLUX.1 Fill model - "
                                "install 'flux-fill' from the Foundry first."
                            ),
                        )
```

In `run_image_generation` (~line 1340), thread the dict into the generator call:

```python
    result = await direct_generator.generate_image(
        job_id=job_id,
        prompt=request.prompt,
        negative_prompt=request.negative_prompt,
        width=request.width,
        height=request.height,
        steps=request.steps,
        cfg_scale=request.cfg_scale,
        seed=request.seed if request.seed != -1 else None,
        model_name=request.model,
        scheduler=request.scheduler,
        acceleration_settings=accel_settings,
        loras=[l.dict() for l in request.loras],
        guided=_guided_payload(request),
        progress_callback=lambda p: job_manager.update_job(job_id, progress=p)
    )
```

Note: `direct_generator.generate_image` does not accept `guided` yet - Task 5 adds it. Run ONLY the schema tests now (the endpoint path is exercised in Task 5's suite):

- [ ] **Step 5: Run tests to verify they pass**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_request.py backend/tests/test_lora_request.py -q`
Expected: all passed (guided tests green; the #136 lora request tests still green)

- [ ] **Step 6: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git add backend/main.py backend/tests/test_guided_request.py && git branch --show-current && git commit -m "feat(guided): guided-pass request contract + pre-flight 422 honesty gate (#34)"
```

---

### Task 5: Generator guided branch (`backend/utils/direct_generator.py`)

**Files:**
- Modify: `backend/utils/direct_generator.py` (imports ~line 36; `generate_image` ~line 304; `_generate_sync` ~line 368)
- Test: `backend/tests/test_direct_generator_guided.py`

**Interfaces:**
- Consumes: `resolve_guided_pass` (Task 2), `rasterize_mask`/`mask_coverage` (Task 1), `derive_variant`/`filter_call_kwargs` (Task 3), the `guided` dict from Task 4.
- Produces: job result gains `"guided": {"pass": kind, "notices": [...], "dropped_params": [...]}` (or `None` for plain txt2img). FLUX + inpaint loads model `"flux-fill"` instead of the requested model.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_direct_generator_guided.py
"""#34 PR1: guided branch in _generate_sync - img2img/inpaint via fake pipelines.
Mirrors test_direct_generator_loras.py (skips without torch+diffusers)."""
import pytest

HAS_DEPS = False
try:
    import torch  # noqa: F401
    import diffusers  # noqa: F401

    HAS_DEPS = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(not HAS_DEPS, reason="requires torch + diffusers")

MASK = {"type": "rectangle", "points": [{"x": 0, "y": 0}],
        "bounds": {"x": 0, "y": 0, "width": 8, "height": 8}, "brush_size": None}


class _FakePipeline:
    """Records call kwargs; returns a real PIL image. Accepts guided kwargs."""

    def __init__(self, calls, image):
        self._calls = calls
        self._image = image

    def __call__(self, prompt=None, negative_prompt=None, image=None,
                 mask_image=None, strength=0.75, width=None, height=None,
                 num_inference_steps=25, guidance_scale=7.5, generator=None,
                 callback_on_step_end=None):
        self._calls.append({
            "prompt": prompt, "image": image, "mask_image": mask_image,
            "strength": strength, "width": width, "height": height,
        })

        class _Out:
            pass

        out = _Out()
        out.images = [self._image]
        return out


def _generator(tmp_path, calls, monkeypatch, fake=None, family="sd15"):
    from PIL import Image
    from utils import direct_generator as dg

    gen = dg.DirectGenerator.__new__(dg.DirectGenerator)
    gen.device = "cpu"
    gen.output_dir = str(tmp_path)
    gen.applied_acceleration = {}

    fake = fake or _FakePipeline(calls, Image.new("RGB", (8, 8)))
    loaded = []
    monkeypatch.setattr(gen, "load_model",
                        lambda name, **k: loaded.append(name) or fake)
    monkeypatch.setattr(gen, "_configure_scheduler", lambda p, s: p)
    monkeypatch.setattr(dg, "_resolve_record",
                        lambda _id: {"base_architecture": family})
    # Derivation returns the same fake (component sharing is diffusers' job).
    monkeypatch.setattr(dg, "derive_variant", lambda base, kind: base)
    return gen, loaded


def _base_image(tmp_path):
    from PIL import Image

    path = tmp_path / "base.png"
    Image.new("RGB", (16, 16), (200, 30, 30)).save(path)
    return str(path)


def _run(gen, tmp_path, guided):
    return gen._generate_sync(
        prompt="a castle", negative_prompt="", width=8, height=8, steps=1,
        cfg_scale=7.5, seed=1, model_name="sd-1.5", scheduler="euler",
        progress_callback_fn=lambda *a: None, output_dir=str(tmp_path),
        loras=None, guided=guided,
    )


def test_txt2img_unchanged_when_no_guided(monkeypatch, tmp_path):
    calls = []
    gen, _ = _generator(tmp_path, calls, monkeypatch)
    result = _run(gen, tmp_path, guided=None)
    assert calls[0]["image"] is None
    assert calls[0]["width"] == 8
    assert result["guided"] is None


def test_img2img_passes_init_image_and_strength(monkeypatch, tmp_path):
    calls = []
    gen, _ = _generator(tmp_path, calls, monkeypatch)
    guided = {"controlnet": [], "denoising_strength": 0.6, "inpaint": None,
              "reference_images": [{"layer_id": "r1", "source_path": _base_image(tmp_path),
                                    "mask": MASK, "strength": 1.0}]}
    result = _run(gen, tmp_path, guided)
    assert calls[0]["image"] is not None
    assert calls[0]["mask_image"] is None
    assert calls[0]["strength"] == 0.6
    assert result["guided"]["pass"] == "img2img"
    assert any("mask" in n.lower() for n in result["guided"]["notices"])


def test_inpaint_passes_image_and_rasterized_mask(monkeypatch, tmp_path):
    calls = []
    gen, _ = _generator(tmp_path, calls, monkeypatch)
    guided = {"controlnet": [], "denoising_strength": 0.9, "reference_images": [],
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": MASK, "prompt": "a red door", "negative_prompt": None}}
    result = _run(gen, tmp_path, guided)
    assert calls[0]["image"] is not None
    assert calls[0]["mask_image"] is not None
    assert calls[0]["mask_image"].size == (8, 8)
    assert calls[0]["prompt"] == "a red door"   # inpaint prompt override wins
    assert result["guided"]["pass"] == "inpaint"


def test_flux_inpaint_routes_to_flux_fill(monkeypatch, tmp_path):
    calls = []
    gen, loaded = _generator(tmp_path, calls, monkeypatch, family="flux")
    guided = {"controlnet": [], "denoising_strength": 0.75, "reference_images": [],
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": MASK, "prompt": None, "negative_prompt": None}}
    _run(gen, tmp_path, guided)
    assert loaded == ["flux-fill"]


def test_empty_mask_fails_the_job(monkeypatch, tmp_path):
    from guided.passes import GuidedValidationError

    calls = []
    gen, _ = _generator(tmp_path, calls, monkeypatch)
    empty_mask = dict(MASK, type="erase")
    guided = {"controlnet": [], "denoising_strength": 0.75, "reference_images": [],
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": empty_mask, "prompt": None, "negative_prompt": None}}
    with pytest.raises(GuidedValidationError):
        _run(gen, tmp_path, guided)
    assert calls == []  # never reached the pipeline - no silent unguided output


def test_dropped_params_are_reported(monkeypatch, tmp_path):
    from PIL import Image

    class _NoStrength:
        def __init__(self, image):
            self._image = image
            self.calls = []

        def __call__(self, prompt=None, image=None, mask_image=None, width=None,
                     height=None, num_inference_steps=25, guidance_scale=7.5,
                     generator=None, callback_on_step_end=None):
            self.calls.append(True)
            out = type("O", (), {})()
            out.images = [self._image]
            return out

    fake = _NoStrength(Image.new("RGB", (8, 8)))
    gen, _ = _generator(tmp_path, [], monkeypatch, fake=fake, family="flux")
    guided = {"controlnet": [], "denoising_strength": 0.75, "reference_images": [],
              "inpaint": {"layer_id": "i1", "image_path": _base_image(tmp_path),
                          "mask": MASK, "prompt": None, "negative_prompt": None}}
    result = _run(gen, tmp_path, guided)
    assert fake.calls
    assert "strength" in result["guided"]["dropped_params"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_direct_generator_guided.py -q`
Expected: FAIL - `TypeError: _generate_sync() got an unexpected keyword argument 'guided'` (and missing `_resolve_record`/`derive_variant` attributes)

- [ ] **Step 3: Implement the guided branch**

In `backend/utils/direct_generator.py`:

**(a)** After `from foundry.lora import loras_applied` (~line 36), add:

```python
# #34 guided passes (all three modules import with no torch/diffusers).
from guided.masks import mask_coverage, rasterize_mask
from guided.passes import GuidedValidationError, resolve_guided_pass
from guided.pipelines import derive_variant, filter_call_kwargs
```

**(b)** After `_resolve_lora_record` (~line 102), add:

```python
def _resolve_record(model_id: str):
    """Registry record for any installed model id (lazy main import)."""
    from main import model_registry
    return model_registry.get_record(model_id)
```

**(c)** Add `guided: Optional[Dict[str, Any]] = None` as the last parameter of `generate_image` (after `loras`), and append `guided` as the last positional argument of the `run_in_executor` call (after `loras`).

**(d)** Add `guided: Optional[Dict[str, Any]] = None` as the last parameter of `_generate_sync` (after `loras`), and replace the body from `# Load pipeline` through the `with loras_applied(...)` block with:

```python
        # #34: one validated pass plan (same seam the endpoint 422s through).
        pass_plan = resolve_guided_pass(
            (guided or {}).get("controlnet"),
            (guided or {}).get("reference_images"),
            (guided or {}).get("inpaint"),
            (guided or {}).get("denoising_strength", 0.75),
        )

        # FLUX inpaint runs on the dedicated FLUX.1 Fill model (a naive
        # from_pipe latent blend on flux-dev is measurably worse - design
        # decision in the PR1 spec). The endpoint pre-flighted availability.
        model_for_pass = model_name
        if pass_plan.kind == "inpaint":
            record = _resolve_record(model_name) or {}
            if record.get("base_architecture") == "flux":
                model_for_pass = "flux-fill"

        # Load pipeline
        pipeline = self.load_model(model_for_pass, acceleration_settings=acceleration_settings)
        pipeline = self._configure_scheduler(pipeline, scheduler)

        # Set generator for reproducibility
        generator = torch.Generator(device=self.device).manual_seed(seed)

        # Generate
        print(f"🎨 Generating: {width}x{height}, {steps} steps, seed={seed}")

        # callback_on_step_end is the only progress hook diffusers >=0.37
        # supports on every shipped pipeline: SD3/Flux/LTX removed the legacy
        # callback=/callback_steps= kwargs entirely (passing them - even as
        # None - raises TypeError), and SD/SDXL only tolerate them behind a
        # deprecation shim slated for removal in 1.0.0.
        def _on_step_end(_pipe, step, timestep, callback_kwargs):
            progress_callback_fn(step, timestep, callback_kwargs.get("latents"))
            return callback_kwargs

        effective_prompt = pass_plan.prompt_override or prompt
        effective_negative = (
            pass_plan.negative_prompt_override
            if pass_plan.negative_prompt_override is not None
            else (negative_prompt if negative_prompt else None)
        )
        call_kwargs: Dict[str, Any] = {
            "prompt": effective_prompt,
            "negative_prompt": effective_negative,
            "num_inference_steps": steps,
            "guidance_scale": cfg_scale,
            "generator": generator,
            "callback_on_step_end": _on_step_end,
        }

        guided_report: Optional[Dict[str, Any]] = None
        if pass_plan.kind == "none":
            call_kwargs["width"] = width
            call_kwargs["height"] = height
            run_pipeline = pipeline
        else:
            init_image = Image.open(pass_plan.image_path).convert("RGB")
            base_size = init_image.size
            init_image = init_image.resize((width, height), Image.Resampling.LANCZOS)
            call_kwargs["image"] = init_image
            call_kwargs["strength"] = pass_plan.strength
            if pass_plan.kind == "inpaint":
                mask_image = rasterize_mask(pass_plan.mask or {}, base_size[0], base_size[1])
                if mask_coverage(mask_image) == 0.0:
                    raise GuidedValidationError(
                        "The inpaint mask is empty - draw a mask region on the canvas first."
                    )
                call_kwargs["mask_image"] = mask_image.resize(
                    (width, height), Image.Resampling.LANCZOS)
                call_kwargs["width"] = width
                call_kwargs["height"] = height
            # flux-fill IS the inpaint pipeline - only derive for base models.
            run_pipeline = (
                pipeline if model_for_pass != model_name
                else derive_variant(pipeline, pass_plan.kind)
            )

        call_kwargs, dropped_params = filter_call_kwargs(run_pipeline, call_kwargs)
        if pass_plan.kind != "none":
            guided_report = {
                "pass": pass_plan.kind,
                "notices": list(pass_plan.notices),
                "dropped_params": dropped_params,
            }

        with loras_applied(pipeline, loras or [], _resolve_lora_record) as lora_result:
            with torch.inference_mode():
                output = run_pipeline(**call_kwargs)
```

**(e)** Add the report to the return dict (after `"loras": lora_result,`):

```python
            "guided": guided_report,
```

**(f)** In `load_model`'s cache bookkeeping nothing changes - `flux-fill` caches under its own key exactly like any model.

- [ ] **Step 4: Run tests to verify they pass**

Run: `backend/venv/Scripts/python.exe -m pytest backend/tests/test_direct_generator_guided.py backend/tests/test_direct_generator_loras.py -q`
Expected: all passed (6 guided + the 2 #136 lora bracket tests still green - LoRA composition preserved)

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git add backend/utils/direct_generator.py backend/tests/test_direct_generator_guided.py && git branch --show-current && git commit -m "feat(guided): img2img + inpaint pass execution with flux-fill routing (#34)"
```

---

### Task 6: Frontend - brush size threading

**Files:**
- Modify: `src/types/project.ts` (`RegionMask`, ~line 170)
- Modify: `src/types/generation.ts` (`GenerationMaskPayload`, ~line 74)
- Modify: `src/components/edit/RegionMaskDrawer.tsx` (`onMaskCommit` prop type ~line 18; `commitDraft` ~line 144)
- Modify: `src/components/layout/Canvas.tsx` (`handleMaskCommit`, ~line 102)
- Modify: `src/features/generation/resolveCanvasControlLayers.ts` (`toMaskPayload`, ~line 146)
- Test: `src/components/edit/RegionMaskDrawer.test.tsx`, `src/features/generation/resolveCanvasControlLayers.test.ts`

**Interfaces:**
- Produces: brush/erase masks carry `brushSize` (camelCase in the store's `RegionMask`) and `brush_size` (snake_case in `GenerationMaskPayload` for the backend, matching Task 4's `GuidedMaskPayload.brush_size`).

- [ ] **Step 1: Write the failing tests**

Add to `src/features/generation/resolveCanvasControlLayers.test.ts`, inside the existing `describe('resolveCanvasControlLayers', ...)` block, using the file's existing `buildMask`/`buildLayer`/`buildScene` helpers and `mediaAssets` fixture (the 'asset-controlnet' entry resolves to `C:/vision-studio-inputs/pose-map.png`):

```ts
  it('projects mask brushSize into the payload as brush_size', () => {
    const scene = buildScene([
      buildLayer({
        id: 'controlnet-layer',
        name: 'Pose Guide',
        type: 'controlnet',
        sourceMediaAssetId: 'asset-controlnet',
        preprocessor: 'canny',
        mask: { ...buildMask(), type: 'brush', brushSize: 24 },
      }),
    ]);

    const resolved = resolveCanvasControlLayers({
      scene,
      mediaAssets,
      referenceSets,
      generationType: 'image',
      baseImagePath: 'C:/vision-studio-output/current/frame.png',
    });

    expect(resolved.errors).toEqual([]);
    expect(resolved.controlnet[0].mask.brush_size).toBe(24);
  });

  it('omits brush_size when the mask has no recorded stroke width', () => {
    const scene = buildScene([
      buildLayer({
        id: 'controlnet-layer',
        type: 'controlnet',
        sourceMediaAssetId: 'asset-controlnet',
        preprocessor: 'canny',
      }),
    ]);

    const resolved = resolveCanvasControlLayers({
      scene,
      mediaAssets,
      referenceSets,
      generationType: 'image',
      baseImagePath: 'C:/vision-studio-output/current/frame.png',
    });

    expect(resolved.controlnet[0].mask.brush_size).toBeUndefined();
  });
```

Add to `src/components/edit/RegionMaskDrawer.test.tsx`, inside the existing `describe('RegionMaskDrawer', ...)` block, following the file's exact render + `stubBoundingRect` + `fireEvent.pointer*` pattern (see the rectangle-commit test at ~line 116):

```ts
  it('includes brushSize in brush mask commits', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="brush"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 200, clientY: 250, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'brush', brushSize: 20 })
    );
  });

  it('omits brushSize from polygon commits', () => {
    const onCommit = vi.fn();
    const { getByTestId } = render(
      <RegionMaskDrawer
        activeRegion={mockRegion}
        canvasWidth={CANVAS_W}
        canvasHeight={CANVAS_H}
        tool="polygon"
        brushSize={20}
        onMaskCommit={onCommit}
      />
    );
    const surface = getByTestId('region-mask-drawer');
    stubBoundingRect(surface);

    fireEvent.pointerDown(surface, { clientX: 100, clientY: 150, button: 0, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 200, clientY: 250, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 200, clientY: 250, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].brushSize).toBeUndefined();
  });
```

Note: the existing rectangle-commit test asserts an EXACT object (`toHaveBeenCalledWith({type, points, bounds})`) - the implementation must therefore add `brushSize` only for brush/erase commits, never rectangle/polygon, or that test breaks.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/generation/resolveCanvasControlLayers.test.ts src/components/edit/RegionMaskDrawer.test.tsx`
Expected: FAIL - `brush_size` is `undefined`; commit object has no `brushSize`

- [ ] **Step 3: Implement the threading**

`src/types/project.ts` - add to `RegionMask` (after `bounds`):

```ts
  /** Brush/erase stroke diameter in intrinsic image pixels (#34). */
  brushSize?: number;
```

`src/types/generation.ts` - add to `GenerationMaskPayload`:

```ts
  /** Brush/erase stroke diameter in intrinsic image pixels (#34). */
  brush_size?: number;
```

`src/components/edit/RegionMaskDrawer.tsx` - extend the commit prop type:

```ts
  onMaskCommit: (update: {
    type: MaskType;
    points: Point[];
    bounds: BoundingBox;
    brushSize?: number;
  }) => void;
```

and in `commitDraft`'s brush/polygon/erase branch (~line 169), include the width for stroke tools:

```ts
    } else if (current.tool === 'brush' || current.tool === 'polygon' || current.tool === 'erase') {
      if (current.points.length >= 2) {
        onMaskCommit({
          type: current.tool,
          points: current.points,
          bounds: computeBounds(current.points),
          ...(current.tool !== 'polygon' ? { brushSize } : {}),
        });
      }
    }
```

(`brushSize` is already a prop in scope; add it to the `commitDraft` dependency array.)

`src/components/layout/Canvas.tsx` - in `handleMaskCommit`, add `brushSize: update.brushSize,` alongside `bounds: update.bounds,` in BOTH branches (region lock ~line 112 and control layer ~line 124).

`src/features/generation/resolveCanvasControlLayers.ts` - in `toMaskPayload` (~line 146):

```ts
function toMaskPayload(layer: CanvasControlLayer): GenerationMaskPayload {
  return {
    type: layer.mask.type,
    points: layer.mask.points.map((point) => ({ ...point })),
    bounds: { ...layer.mask.bounds },
    ...(layer.mask.brushSize !== undefined ? { brush_size: layer.mask.brushSize } : {}),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/generation/resolveCanvasControlLayers.test.ts src/components/edit/RegionMaskDrawer.test.tsx src/components/layout`
Expected: PASS (new tests green; existing drawer/canvas/layout tests unaffected)

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git add src/types/project.ts src/types/generation.ts src/components/edit/RegionMaskDrawer.tsx src/components/layout/Canvas.tsx src/features/generation/resolveCanvasControlLayers.ts src/features/generation/resolveCanvasControlLayers.test.ts src/components/edit/RegionMaskDrawer.test.tsx && git branch --show-current && git commit -m "feat(guided): thread brush stroke width through mask payloads (#34)"
```

---

### Task 7: Frontend - denoising strength threading

**Files:**
- Modify: `src/types/generation.ts` (`ImageGenerationRequestPayload`, ~line 138)
- Modify: `src/pages/GeneratePanel.tsx` (payload assembly, ~line 828)
- Test: `src/pages/GeneratePanel.test.tsx`

**Interfaces:**
- Produces: `denoising_strength` in the image payload whenever a reference-image or inpaint layer is present (matches Task 4's `ImageGenerationRequest.denoising_strength`).

- [ ] **Step 1: Write the failing test**

Add to `src/pages/GeneratePanel.test.tsx`, directly after the existing test `'resolves visible canvas control layers into the image generation payload'` (~line 685), reusing that test's exact seeding helper (`seedCanvasControlLayerScene()`, which seeds a scene with visible controlnet + reference + inpaint layers) and submit flow:

```ts
  it('threads denoising_strength into the payload when a guided pass is present', async () => {
    seedCanvasControlLayerScene();
    render(<GeneratePanel />);

    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'cinematic portrait pass' },
    });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(window.electron.generation.generateImage).toHaveBeenCalledWith(
        expect.objectContaining({ denoising_strength: 0.75 }),
      );
    });
  });

  it('omits denoising_strength for plain txt2img', async () => {
    render(<GeneratePanel />);

    fireEvent.change(screen.getByTestId('mock-prompt-input'), {
      target: { value: 'plain portrait' },
    });
    fireEvent.click(screen.getByTestId('generate-button'));

    await waitFor(() => {
      expect(window.electron.generation.generateImage).toHaveBeenCalled();
    });
    const payload = vi.mocked(window.electron.generation.generateImage).mock
      .calls[0][0] as Record<string, unknown>;
    expect(payload.denoising_strength).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/GeneratePanel.test.tsx`
Expected: FAIL - `denoising_strength` is `undefined` in the inpaint case

- [ ] **Step 3: Implement the threading**

`src/types/generation.ts` - add to `ImageGenerationRequestPayload` (after `inpaint`):

```ts
  /** #34: img2img/inpaint denoising strength (only sent with a guided pass). */
  denoising_strength?: number;
```

`src/pages/GeneratePanel.tsx` - in the `imageRequest` assembly (~line 850, after the inpaint spread):

```ts
          ...(resolvedCanvasControlLayers.referenceImages.length > 0 ||
          resolvedCanvasControlLayers.inpaint
            ? { denoising_strength: refConfig.denoisingStrength }
            : {}),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/GeneratePanel.test.tsx`
Expected: PASS (2 new + all existing GeneratePanel tests)

- [ ] **Step 5: Commit**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git add src/types/generation.ts src/pages/GeneratePanel.tsx src/pages/GeneratePanel.test.tsx && git branch --show-current && git commit -m "feat(guided): thread denoising strength with guided-pass payloads (#34)"
```

---

### Task 8: Local smoke test, gates, PR

**Files:**
- Create: `backend/tests/test_guided_smoke_local.py`

**Interfaces:**
- Consumes: everything above. No new interfaces.

- [ ] **Step 1: Add the env-gated real-model smoke test**

```python
# backend/tests/test_guided_smoke_local.py
"""#34 PR1 acceptance smoke: a real inpaint pass edits ONLY the masked region.

Runs ONLY when VS_REAL_SMOKE=1 (real model download/VRAM) - skipped on CI and
in normal local runs. Maintainer gate before merging PR1.
"""
import os

import pytest

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


def test_inpaint_changes_masked_region_only(tmp_path):
    import numpy as np
    from PIL import Image

    from guided.masks import rasterize_mask
    from guided.pipelines import derive_variant, filter_call_kwargs
    from utils.direct_generator import DirectGenerator

    gen = DirectGenerator(
        models_dir=os.environ.get("VS_MODELS_DIR", "models"),
        output_dir=str(tmp_path),
    )
    base = Image.new("RGB", (512, 512), (40, 90, 40))
    mask = {"type": "rectangle", "points": [{"x": 128, "y": 128}],
            "bounds": {"x": 128, "y": 128, "width": 256, "height": 256},
            "brush_size": None}

    pipeline = gen.load_model("sd-1.5")
    variant = derive_variant(pipeline, "inpaint")
    kwargs, _ = filter_call_kwargs(variant, {
        "prompt": "a bright red metal door, photo",
        "image": base,
        "mask_image": rasterize_mask(mask, 512, 512),
        "strength": 1.0,
        "num_inference_steps": 12,
        "guidance_scale": 7.5,
    })
    result = variant(**kwargs).images[0]

    before = np.asarray(base, dtype=np.int32)
    after = np.asarray(result.resize(base.size), dtype=np.int32)
    diff = np.abs(after - before).sum(axis=2)
    inside = diff[160:352, 160:352].mean()
    outside_strip = diff[:96, :].mean()
    assert inside > 30, "masked region did not change - inpaint is not real"
    assert inside > outside_strip * 2, "edit leaked far outside the mask"
```

- [ ] **Step 2: Commit the smoke test**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git add backend/tests/test_guided_smoke_local.py && git branch --show-current && git commit -m "test(guided): env-gated real-model inpaint smoke (#34)"
```

- [ ] **Step 3: Run the full gate suite**

Run each; ALL must be green before the PR:

1. `npm run typecheck` - expected: clean across all 3 tsconfigs
2. `npm test` - expected: all vitest suites pass
3. `npm run build` - expected: clean production build
4. `backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_masks.py backend/tests/test_guided_passes.py backend/tests/test_guided_pipelines.py backend/tests/test_guided_request.py backend/tests/test_direct_generator_guided.py backend/tests/test_direct_generator_loras.py backend/tests/test_lora_request.py -q` - expected: all passed
5. Targeted fast backend sweep (the Targeted + CI gate protocol): `backend/venv/Scripts/python.exe -m pytest backend/tests -q --ignore=backend/tests/test_controlnet_service.py --ignore=backend/tests/test_direct_generator.py --ignore=backend/tests/test_direct_generator_progress.py --ignore=backend/tests/test_direct_generator_accel.py --ignore=backend/tests/test_direct_generator_accel_cache.py --ignore=backend/tests/test_direct_video_generator_accel.py --ignore=backend/tests/test_video_service.py --ignore=backend/tests/test_edit_service.py --ignore=backend/tests/test_retrieval_embedder.py --ignore=backend/tests/test_foundry_hardware.py` - expected: all passed; CI's stub run is the authoritative full-suite check
6. (Maintainer, optional but recommended before merge) `VS_REAL_SMOKE=1 backend/venv/Scripts/python.exe -m pytest backend/tests/test_guided_smoke_local.py -q` - expected: 1 passed on a machine with sd-1.5 installed

- [ ] **Step 4: Push and open the PR**

```bash
export PATH="/c/Program Files/nodejs:$PATH" && git branch --show-current && git push -u origin feat/guided-passes-end-to-end && gh pr create --base main --head feat/guided-passes-end-to-end --title "Guided passes PR1: real img2img + inpaint (#34)" --body "First of 4 staged PRs from docs/superpowers/specs/2026-07-04-guided-passes-end-to-end-design.md.

- New backend/guided/ package: vector-mask rasterizer, pass resolution with honesty-rail validation, from_pipe variant derivation with signature-filtered kwargs
- ImageGenerationRequest gains controlnet/reference_images/inpaint/denoising_strength - guided fields are consumed or 422ed, never silently dropped
- direct_generator runs img2img and inpaint passes on the cached base pipeline; FLUX inpaint routes to flux-fill; runtime pass failure fails the job
- ControlNet layers 422 with a clear message until PR2; >1 reference until PR4 (IP-Adapter)
- Frontend threads brush stroke width and denoising strength into the payload

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 5: Gate on CI and PAUSE**

Run: `export PATH="/c/Program Files/nodejs:$PATH" && gh pr checks <PR#> --watch --fail-fast`
Expected: all 4 checks pass.
**PAUSE - do not merge without the user's go-ahead (per release process).** After approval: `gh pr merge <PR#> --squash --delete-branch`, then `git checkout main && git pull --ff-only origin main && git fetch --prune origin`, and start the PR2 plan on a fresh branch.
