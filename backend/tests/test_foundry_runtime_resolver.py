"""resolve_model_runtime - the plan, not the execution (spec 6.3/6.4).

Security invariants (M4 gate residuals): remote-code records are REFUSED
without consent - and even with consent M5 has no remote-code load path, so
the refusal names that honestly; pickle records resolve only through the
convert flow; safetensors never silently falls back to pickle; svd has no
from_single_file path (Spike D adjustment 4)."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.hardware import HardwareProfile  # type: ignore[import-not-found]
from foundry.runtime_resolver import (  # type: ignore[import-not-found]
    PIPELINE_BY_FAMILY,
    resolve_model_runtime,
    select_precision,
)


def _profile(**kw):
    base = dict(
        gpu_available=True, gpu_name="RTX", vram_total_bytes=24 * 2**30,
        vram_free_bytes=20 * 2**30, compute_major=8, compute_minor=6,
        torch_available=True, system_ram_total_bytes=32 * 2**30,
        system_ram_available_bytes=24 * 2**30, disk_free_bytes=500 * 2**30,
    )
    base.update(kw)
    return HardwareProfile(**base)


def _record(**kw):
    base = dict(
        id="sdxl-base", artifact_type="checkpoint", capability="image",
        base_architecture="sdxl", source="huggingface", repo_id="org/sdxl",
        tier="verified", format="safetensors", trust_remote_code=False,
        size="6.9 GB", companions=[], measured_vram_bytes=None, locations=[],
    )
    base.update(kw)
    return base


NO_CONSENT = {"pickle": False, "trust_remote_code": False}


class PipelineMapTests(unittest.TestCase):
    def test_all_seven_families_map_for_image_video(self):
        # Spike D stage-1 table: every family resolves in diffusers 0.37.1.
        for family, capability, expected in [
            ("sd15", "image", "StableDiffusionPipeline"),
            ("sdxl", "image", "StableDiffusionXLPipeline"),
            ("sd35", "image", "StableDiffusion3Pipeline"),
            ("flux", "image", "FluxPipeline"),
            ("flux", "inpaint", "FluxFillPipeline"),
            ("ltx", "video", "LTXPipeline"),
            ("svd", "video", "StableVideoDiffusionPipeline"),
            ("animatediff", "video", "AnimateDiffPipeline"),
        ]:
            with self.subTest(family=family, capability=capability):
                entry = PIPELINE_BY_FAMILY[(family, capability)]
                self.assertEqual(entry.pipeline_class, expected)

    def test_svd_is_marked_no_single_file(self):
        self.assertFalse(PIPELINE_BY_FAMILY[("svd", "video")].single_file_ok)
        self.assertTrue(PIPELINE_BY_FAMILY[("sdxl", "image")].single_file_ok)


class PrecisionTests(unittest.TestCase):
    def test_bf16_on_ampere_plus(self):
        self.assertEqual(select_precision("sdxl", _profile()), "bf16")

    def test_fp16_below_ampere(self):
        self.assertEqual(
            select_precision("sdxl", _profile(compute_major=7, compute_minor=5)), "fp16"
        )

    def test_flux_never_fp16(self):
        # flux is numerically unstable in fp16 - below-Ampere flux stays bf16-
        # incapable and resolves fp32-on-offload rather than corrupt output.
        self.assertEqual(
            select_precision("flux", _profile(compute_major=7, compute_minor=5)), "fp32"
        )

    def test_cpu_is_fp32(self):
        self.assertEqual(
            select_precision("sdxl", _profile(gpu_available=False)), "fp32"
        )


class ResolveSecurityTests(unittest.TestCase):
    def test_remote_code_record_is_refused_even_with_consent(self):
        plan = resolve_model_runtime(
            _record(trust_remote_code=True), _profile(),
            consent={"pickle": False, "trust_remote_code": True},
        )
        self.assertIsNotNone(plan.refusal)
        self.assertIn("remote code", plan.refusal)

    def test_pickle_record_routed_to_convert_not_loaded(self):
        plan = resolve_model_runtime(
            _record(format="pickle"), _profile(),
            consent={"pickle": True, "trust_remote_code": False},
        )
        self.assertIsNotNone(plan.refusal)
        self.assertIn("convert", plan.refusal.lower())

    def test_unknown_family_refused_never_guessed(self):
        plan = resolve_model_runtime(
            _record(base_architecture="wan22"), _profile(), consent=NO_CONSENT
        )
        self.assertIsNotNone(plan.refusal)
        self.assertIn("wan22", plan.refusal)

    def test_svd_single_file_refused_with_load_path_named(self):
        plan = resolve_model_runtime(
            _record(base_architecture="svd", capability="video",
                    artifact_type="checkpoint", source="local",
                    locations=["C:/models/svd.safetensors"]),
            _profile(), consent=NO_CONSENT,
        )
        self.assertIsNotNone(plan.refusal)
        self.assertIn("from_single_file", plan.refusal)


class ResolveHappyPathTests(unittest.TestCase):
    def test_verified_sdxl_resolves_complete_plan(self):
        plan = resolve_model_runtime(_record(), _profile(), consent=NO_CONSENT)
        self.assertIsNone(plan.refusal)
        self.assertEqual(plan.pipeline_class, "StableDiffusionXLPipeline")
        self.assertEqual(plan.precision, "bf16")
        self.assertEqual(plan.fit, "fits")
        self.assertFalse(plan.offload)
        self.assertEqual(plan.vram_plan.basis, "estimated")

    def test_tight_vram_plans_offload_flags(self):
        plan = resolve_model_runtime(
            _record(size="6.9 GB"), _profile(vram_free_bytes=4 * 2**30),
            consent=NO_CONSENT,
        )
        self.assertIsNone(plan.refusal)
        self.assertEqual(plan.fit, "fits-with-offload")
        self.assertTrue(plan.offload)
        self.assertTrue(plan.vae_tiling)

    def test_measured_catalog_number_is_used_and_labeled(self):
        plan = resolve_model_runtime(
            _record(measured_vram_bytes=9 * 2**30), _profile(), consent=NO_CONSENT
        )
        self.assertEqual(plan.vram_plan.basis, "measured")
        self.assertEqual(plan.vram_plan.total_bytes, 9 * 2**30)


if __name__ == "__main__":
    unittest.main()
