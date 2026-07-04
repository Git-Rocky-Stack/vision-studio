"""DirectGenerator plan consumption (M5 Task 11).

load_model resolves the runtime plan through the module-level
``resolve_plan`` seam, then loads exactly what the plan says - no
name-substring branching, no hardcoded model map. Refusals raise the
typed ``ModelLoadRefusedError`` and never reach a loader.
"""

import pathlib
import sys
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

try:
    import diffusers
    import torch

    import main  # type: ignore[import-not-found]
    from foundry.hardware import HardwareProfile  # type: ignore[import-not-found]
    from utils.direct_generator import (  # type: ignore[import-not-found]
        DirectGenerator,
        ModelLoadRefusedError,
        resolve_plan,
    )

    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False


def _plan(**kw):
    """A MagicMock RuntimePlan with the loader-relevant fields pinned.

    hardware_profile MUST be pinned: left as a MagicMock auto-child it reads
    as gpu_available=truthy, resolve_acceleration then auto-enables
    torch.compile, and dynamo tracing the mocked pipeline's unet allocates
    unboundedly (observed: >25 GB RSS, an effective hang).
    """
    base = dict(
        refusal=None,
        pipeline_class="StableDiffusionXLPipeline",
        precision="bf16",
        offload=False,
        vae_tiling=False,
        attention_slicing=True,
        single_file=False,
        config_catalog_id=None,
        fallback_ladder=[],
        hardware_profile=None,
    )
    base.update(kw)
    return mock.MagicMock(**base)


def _profile(**kw):
    base = dict(
        gpu_available=True, gpu_name="RTX 4090", vram_total_bytes=24 * 2**30,
        vram_free_bytes=20 * 2**30, compute_major=8, compute_minor=9,
        cuda_version="12.1", torch_available=True,
        system_ram_total_bytes=64 * 2**30, system_ram_available_bytes=48 * 2**30,
        disk_free_bytes=900 * 2**30,
    )
    base.update(kw)
    return HardwareProfile(**base)


@unittest.skipUnless(HAS_DEPS, "Requires torch, diffusers and backend dependencies (run inside venv)")
class PlanConsumptionTests(unittest.TestCase):
    """load_model resolves the plan, then loads exactly what it says."""

    def _generator(self):
        return DirectGenerator("models", "outputs")

    def test_plan_decides_pipeline_class_and_dtype(self):
        # Catalog sdxl on an Ampere GPU -> StableDiffusionXLPipeline + bf16.
        generator = self._generator()
        plan = _plan(pipeline_class="StableDiffusionXLPipeline", precision="bf16")
        with mock.patch("utils.direct_generator.resolve_plan", return_value=plan), \
                mock.patch.object(diffusers.StableDiffusionXLPipeline,
                                  "from_pretrained") as loader:
            generator.load_model("sdxl-base")
        self.assertEqual(loader.call_args.kwargs["torch_dtype"], torch.bfloat16)

    def test_from_pretrained_always_passes_use_safetensors(self):
        # M4-gate residual: never any safetensors -> pickle fallback.
        generator = self._generator()
        plan = _plan(pipeline_class="StableDiffusionPipeline", precision="fp16")
        with mock.patch("utils.direct_generator.resolve_plan", return_value=plan), \
                mock.patch.object(diffusers.StableDiffusionPipeline,
                                  "from_pretrained") as loader:
            generator.load_model("sd-1-5")
        self.assertIs(loader.call_args.kwargs["use_safetensors"], True)

    def test_refusal_raises_typed_error_and_never_loads(self):
        generator = self._generator()
        plan = mock.MagicMock(refusal="pickle weights - convert first")
        with mock.patch("utils.direct_generator.resolve_plan", return_value=plan), \
                mock.patch.object(diffusers.StableDiffusionXLPipeline,
                                  "from_pretrained") as loader:
            with self.assertRaises(ModelLoadRefusedError) as ctx:
                generator.load_model("sketchy-model")
        self.assertIn("convert", str(ctx.exception))
        loader.assert_not_called()

    def test_offload_plan_applies_offload_flags(self):
        plan = _plan(
            pipeline_class="StableDiffusionPipeline", precision="fp16",
            offload=True, vae_tiling=True,
        )
        pipeline = mock.MagicMock()
        with mock.patch("utils.direct_generator.resolve_plan", return_value=plan), \
                mock.patch.object(diffusers.StableDiffusionPipeline,
                                  "from_pretrained", return_value=pipeline):
            self._generator().load_model("sd-1-5")
        pipeline.enable_model_cpu_offload.assert_called_once()
        pipeline.vae.enable_tiling.assert_called_once()
        # Offload manages device placement - the manual .to(device) must not run.
        pipeline.to.assert_not_called()

    def test_single_file_plan_uses_from_single_file_with_pinned_config(self):
        plan = _plan(
            pipeline_class="StableDiffusionXLPipeline", precision="fp16",
            single_file=True, config_catalog_id="sdxl-base",
        )
        with mock.patch("utils.direct_generator.resolve_plan", return_value=plan), \
                mock.patch.object(diffusers.StableDiffusionXLPipeline,
                                  "from_single_file") as loader:
            self._generator().load_model("local-checkpoint")
        # config= pinned from the catalog - never key-sniffed (Spike D adj. 3).
        self.assertIn("config", loader.call_args.kwargs)
        self.assertEqual(loader.call_args.kwargs["torch_dtype"], torch.float16)

    def test_oom_steps_the_fallback_ladder_then_reraises_honestly(self):
        generator = self._generator()
        pipeline = mock.MagicMock()
        plan = _plan(
            pipeline_class="StableDiffusionXLPipeline", precision="bf16",
            fallback_ladder=["precision:fp16"],
        )
        with mock.patch("utils.direct_generator.resolve_plan", return_value=plan), \
                mock.patch.object(
                    diffusers.StableDiffusionXLPipeline, "from_pretrained",
                    side_effect=[torch.cuda.OutOfMemoryError("boom"), pipeline],
                ) as loader:
            generator.load_model("sdxl-base")
        self.assertEqual(loader.call_count, 2)
        # The retry consumed the precision:fp16 rung.
        self.assertEqual(loader.call_args.kwargs["torch_dtype"], torch.float16)

        # Exhausted ladder re-raises the OOM honestly.
        generator2 = self._generator()
        plan2 = _plan(pipeline_class="StableDiffusionXLPipeline", fallback_ladder=[])
        with mock.patch("utils.direct_generator.resolve_plan", return_value=plan2), \
                mock.patch.object(
                    diffusers.StableDiffusionXLPipeline, "from_pretrained",
                    side_effect=torch.cuda.OutOfMemoryError("boom"),
                ):
            with self.assertRaises(torch.cuda.OutOfMemoryError):
                generator2.load_model("sdxl-base")


@unittest.skipUnless(HAS_DEPS, "Requires torch, diffusers and backend dependencies (run inside venv)")
class ResolvePlanOverrideTests(unittest.TestCase):
    """The spec-D8 override seam: applied after resolution, never over a refusal."""

    def _patched_main(self, record, consent=None):
        registry = mock.MagicMock()
        registry.get_record.return_value = record
        consent_store = mock.MagicMock()
        consent_store.get.return_value = consent or {"pickle": False, "trust_remote_code": False}
        return (
            mock.patch.object(main, "model_registry", registry),
            mock.patch.object(main, "consent_store", consent_store),
            mock.patch.object(main, "probe_hardware", return_value=_profile()),
        )

    def test_precision_override_beats_plan_bf16(self):
        record = dict(
            id="sdxl-x", base_architecture="sdxl", capability="image",
            artifact_type="diffusers-pipeline", locations=[], size="6.9 GB",
            repo_id="stabilityai/stable-diffusion-xl-base-1.0",
            format="safetensors", trust_remote_code=False,
        )
        patches = self._patched_main(record)
        with patches[0], patches[1], patches[2]:
            baseline = resolve_plan("sdxl-x")
            overridden = resolve_plan("sdxl-x", overrides={"precision": "fp16"})
        self.assertEqual(baseline.precision, "bf16")
        self.assertEqual(overridden.precision, "fp16")

    def test_refusal_is_never_overridable(self):
        record = dict(
            id="sketchy", base_architecture="sd15", capability="image",
            artifact_type="checkpoint", locations=["sketchy.ckpt"], size="4 GB",
            repo_id=None, format="pickle", trust_remote_code=False,
        )
        patches = self._patched_main(record, consent={"pickle": True, "trust_remote_code": False})
        with patches[0], patches[1], patches[2]:
            plan = resolve_plan("sketchy", overrides={"precision": "fp16", "offload": True})
        # The refusal survives; the overrides were never applied onto it.
        self.assertTrue(plan.refusal)
        self.assertIn("convert", plan.refusal)
        self.assertIsNone(plan.precision)
        self.assertFalse(plan.offload)

    def test_unknown_model_raises_typed_error(self):
        registry = mock.MagicMock()
        registry.get_record.return_value = None
        with mock.patch.object(main, "model_registry", registry):
            with self.assertRaises(ModelLoadRefusedError) as ctx:
                resolve_plan("ghost-model")
        self.assertIn("ghost-model", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
